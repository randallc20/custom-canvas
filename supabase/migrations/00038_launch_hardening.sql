-- 00038_launch_hardening.sql
-- Pre-launch adversarial review remediation (2026-08-25). Six defects, all
-- proven by probe against DEV before this migration was written:
--   1. any authenticated user could forge orders (review fraud + oversell grief)
--   2. 00035 silently dropped the order status-transition guard
--   3. listing_series leaked draft artists' unreleased work to anon
--   4. blocking never blocked anything (the check couldn't see the block row)
--   5. public review queries returned nothing (attribution only via RLS'd orders)
--   6. storage INSERT wasn't folder-scoped like its sibling buckets

-- ============================================================
-- (1) orders: remove the forgeable INSERT path
-- ============================================================
-- Real orders are created ONLY by the Stripe webhook via the service-role
-- client, which bypasses RLS. This policy constrained buyer_id and nothing
-- else -- not status, amount_cents, artist_id, listing_id -- so any signed-in
-- user could POST an arbitrary order. A forged 'delivered' order satisfied the
-- reviews INSERT policy (fabricated reviews on any artist); a forged 'paid'
-- order filled the orders_one_live_per_listing partial unique index, so the
-- real buyer's webhook insert 23505'd, was read as an oversell, and was
-- auto-refunded. The policy grants no legitimate capability: drop it.
DROP POLICY IF EXISTS "Buyers can create orders" ON orders;

-- ============================================================
-- (2) orders: restore the status-transition guard
-- ============================================================
-- 00012 added a branch forbidding non-privileged callers from setting any
-- status other than shipped/delivered. 00035 (refund bookkeeping) rewrote this
-- function with CREATE OR REPLACE to add the money-column freezes and dropped
-- that branch. Since then an artist could set their own order to 'refunded'
-- (which makes the admin settle route short-circuit on "Already refunded",
-- permanently stranding the buyer's money while the artist keeps the payout),
-- hide a sale from commission reporting, or jump to 'delivered' to unlock
-- reviews before shipping. Restored below, keeping every 00035 freeze.
CREATE OR REPLACE FUNCTION guard_orders_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.amount_cents := OLD.amount_cents;
    NEW.platform_fee_cents := OLD.platform_fee_cents;
    NEW.artist_payout_cents := OLD.artist_payout_cents;
    NEW.buyer_fee_cents := OLD.buyer_fee_cents;
    NEW.shipping_cents := OLD.shipping_cents;
    NEW.buyer_id := OLD.buyer_id;
    NEW.artist_id := OLD.artist_id;
    NEW.listing_id := OLD.listing_id;
    NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
    NEW.stripe_refund_id := OLD.stripe_refund_id;
    NEW.stripe_reversal_id := OLD.stripe_reversal_id;
    NEW.amount_tax_cents := OLD.amount_tax_cents;
    -- The artist's refund approval goes through /api/orders/[id]/approve-refund,
    -- which writes with the admin client (privileged) -- freeze the direct path.
    NEW.refund_approved_at := OLD.refund_approved_at;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('shipped', 'delivered') THEN
      RAISE EXCEPTION 'orders can only be advanced to shipped or delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- (3) listing_series: follow the artist's liveness
-- ============================================================
-- 00036 gated every other artist child table (images, tags, education,
-- personal photos, videos) but missed listing_series, which kept 00002's
-- USING (true). Anon could enumerate a draft/pending/rejected artist's series
-- names, descriptions and cover images -- reconstructing the shop the approval
-- gate exists to hide. Same shape as 00036's artist_education policy.
DROP POLICY IF EXISTS "Series visible to all" ON listing_series;
CREATE POLICY "Series follow artist visibility" ON listing_series
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = listing_series.artist_id
        AND (ap.is_live = true OR ap.profile_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- (4) messaging: make blocking actually block
-- ============================================================
-- 00014 enforced blocks in the messages INSERT policy with a NOT EXISTS over
-- blocked_users. But blocked_users' own RLS is USING (blocker_id = auth.uid()),
-- so the BLOCKED SENDER -- the one the check runs as -- cannot see the blocker's
-- row. The subquery therefore always found nothing and every blocked message
-- was delivered in full. Evaluate the check in a SECURITY DEFINER function so
-- it reads the block row regardless of the caller (the is_privileged pattern).
CREATE OR REPLACE FUNCTION sender_is_blocked(conv_id UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations c
    JOIN blocked_users b ON b.blocked_id = auth.uid()
    WHERE c.id = conv_id
      AND b.blocker_id = CASE WHEN c.participant_one = auth.uid()
                              THEN c.participant_two ELSE c.participant_one END
  );
$$;

DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages" ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE participant_one = auth.uid() OR participant_two = auth.uid()
    )
    AND NOT sender_is_blocked(conversation_id)
  );

-- ...and a blocked user must not simply open a fresh thread instead.
CREATE OR REPLACE FUNCTION blocked_by(other UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users WHERE blocker_id = other AND blocked_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Authenticated users can create conversations" ON conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_one AND NOT blocked_by(participant_two));

-- ============================================================
-- (5) reviews: attribute to the artist directly
-- ============================================================
-- reviews carries only order_id, so every public query reached the artist via
-- orders!inner -- and orders RLS is buyer/artist/admin only. The inner join
-- dropped every row for anonymous shoppers, so each artist page rendered
-- "No reviews yet" with no star average, for exactly the audience reviews
-- exist to persuade. Denormalize artist_id, derived server-side by trigger so
-- a client can neither forge it nor need to send it.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES artist_profiles(id) ON DELETE CASCADE;

UPDATE reviews r
   SET artist_id = o.artist_id
  FROM orders o
 WHERE o.id = r.order_id
   AND r.artist_id IS NULL;

CREATE OR REPLACE FUNCTION set_review_artist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT artist_id INTO NEW.artist_id FROM orders WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_set_artist ON reviews;
CREATE TRIGGER reviews_set_artist BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_review_artist();

-- Left nullable on purpose: a review whose order was deleted backfills to NULL,
-- and a NOT NULL here would abort the migration on such a row.
CREATE INDEX IF NOT EXISTS reviews_artist_id_idx ON reviews(artist_id);

-- ============================================================
-- (6) storage: folder-scope the two loose INSERT policies
-- ============================================================
-- avatars/banners/artist-photos all scope writes to the caller's own uid
-- folder; listing-images and chat-attachments only checked "authenticated".
-- Inert for real uploads (src/lib/signedUpload.ts forces ${user.id}/... and
-- uses signed upload URLs, which bypass RLS) -- this closes the direct-API
-- path and makes the ownership model consistent.
DROP POLICY IF EXISTS "Authenticated users can upload listing images" ON storage.objects;
CREATE POLICY "Authenticated users can upload listing images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
