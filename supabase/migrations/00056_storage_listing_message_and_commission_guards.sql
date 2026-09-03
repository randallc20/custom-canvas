-- 00056_storage_listing_message_and_commission_guards.sql
-- Review-fix phase R14 (docs/reviews/01-auth-access-r2.md): the second-pass
-- auth/access findings — P2 storage listing, P2 forged system/quote_card
-- messages, P3 commissions INSERT guard, plus two appendix items
-- (orders.review_requested_at freeze, account.updated ordering stamp).
--
-- 1. storage: the five public buckets carried an unconditional
--    `USING (bucket_id = '…')` SELECT policy on storage.objects. Public
--    buckets serve object GETs without any policy, so those policies existed
--    only to permit list/search — and they permitted it for the anon key,
--    which enumerated every uploader's profile-id folder (draft, pending and
--    rejected artists included) and every object beneath it, undoing the
--    row-level approval gate of 00033/00036. Nothing in src/ lists, signs or
--    downloads on these buckets: uploads go through createSignedUploadUrl
--    (which tests the INSERT policy) and the signed token (which bypasses
--    RLS); getPublicUrl is client-side string building. Dropped without
--    replacement. The owner-scoped DELETE/UPDATE policies stay; a direct
--    DELETE is refused by Supabase's storage.protect_delete() regardless,
--    and no app surface deletes.
-- 2. messages / message_attachments: the INSERT policies checked sender and
--    membership only, and the 00045/00001 CHECKs allow `system` and
--    `quote_card`, so any participant could post a platform-styled notice
--    or a quote card whose price disagreed with the commission row. The
--    legitimate writers of those types (the Stripe webhook, the commission
--    accept and updates routes) all use the service role, so a guard keyed
--    on is_privileged() rejects the client path only. The attachment
--    metadata is additionally frozen on UPDATE (there is no client UPDATE
--    policy today; the freeze keeps a future one from reopening the hole).
-- 3. commissions: INSERT was `WITH CHECK (auth.uid() = requester_id)` and
--    nothing else, so a client could create a commission in any status for
--    any artist. Same shape as guard_artist_profiles_insert (00032): force
--    `pending`, null every artist/admin-owned column, require a live artist.
-- 4. orders.review_requested_at joins the guard_orders_update freeze list —
--    only the review-reminder cron (service role) stamps it.
-- 5. artist_profiles.stripe_account_updated_at: the webhook's account.updated
--    handler compares the event's created stamp against it before writing
--    stripe_onboarded, so a stale event delivered late cannot flip a ready
--    artist off. Service-role only: frozen in the UPDATE guard, no SELECT
--    grant (artist_profiles grants are column-level since 00033).

-- ============================================================
-- (1) storage: drop the anon-listable SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view listing images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view banners" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view artist photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view artist videos" ON storage.objects;

-- ============================================================
-- (2) messages / message_attachments: platform-only types
-- ============================================================
CREATE OR REPLACE FUNCTION guard_messages_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged()
     AND NEW.message_type NOT IN ('text', 'image', 'file', 'listing_card') THEN
    RAISE EXCEPTION 'message_type % can only be posted by the platform', NEW.message_type;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS messages_insert_guard ON messages;
CREATE TRIGGER messages_insert_guard BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION guard_messages_insert();

CREATE OR REPLACE FUNCTION guard_message_attachments_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged()
     AND NEW.attachment_type NOT IN ('image', 'file', 'listing_card') THEN
    RAISE EXCEPTION 'attachment_type % can only be posted by the platform', NEW.attachment_type;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS message_attachments_insert_guard ON message_attachments;
CREATE TRIGGER message_attachments_insert_guard BEFORE INSERT ON message_attachments
  FOR EACH ROW EXECUTE FUNCTION guard_message_attachments_insert();

-- A quote card is a copy of the commission row the accept route just wrote;
-- nobody but the platform may rewrite it afterwards.
CREATE OR REPLACE FUNCTION guard_message_attachments_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.message_id := OLD.message_id;
    NEW.attachment_type := OLD.attachment_type;
    NEW.url := OLD.url;
    NEW.metadata := OLD.metadata;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS message_attachments_update_guard ON message_attachments;
CREATE TRIGGER message_attachments_update_guard BEFORE UPDATE ON message_attachments
  FOR EACH ROW EXECUTE FUNCTION guard_message_attachments_update();

-- ============================================================
-- (3) commissions: a client creates a pending request to a live artist
-- ============================================================
CREATE OR REPLACE FUNCTION guard_commissions_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.status := 'pending';
    NEW.quoted_price_cents := NULL;
    NEW.estimated_completion := NULL;
    NEW.artist_notes := NULL;
    NEW.closed_by := NULL;
    NEW.closed_reason := NULL;
    NEW.dispute_reason := NULL;
    NEW.pre_dispute_status := NULL;
    NEW.last_nudge_at := NULL;
    IF NOT EXISTS (SELECT 1 FROM artist_profiles WHERE id = NEW.artist_id AND is_live) THEN
      RAISE EXCEPTION 'commissions can only be requested from a live artist';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS commissions_insert_guard ON commissions;
CREATE TRIGGER commissions_insert_guard BEFORE INSERT ON commissions
  FOR EACH ROW EXECUTE FUNCTION guard_commissions_insert();

-- ============================================================
-- (4) orders: review_requested_at is cron-owned
-- ============================================================
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
    NEW.refund_approved_at := OLD.refund_approved_at;

    NEW.is_pickup := OLD.is_pickup;
    NEW.signature_required := OLD.signature_required;
    NEW.signature_confirmed := OLD.signature_confirmed;
    NEW.evidence_photo_count := OLD.evidence_photo_count;
    NEW.evidence_has_condition_notes := OLD.evidence_has_condition_notes;
    NEW.fulfillment_window_days := OLD.fulfillment_window_days;
    NEW.protection_status := OLD.protection_status;
    NEW.dispute_id := OLD.dispute_id;
    NEW.dispute_outcome := OLD.dispute_outcome;
    NEW.pickup_confirmed_by_buyer_at := OLD.pickup_confirmed_by_buyer_at;
    NEW.pickup_confirmed_by_artist_at := OLD.pickup_confirmed_by_artist_at;

    -- Server-stamped, platform-owned (00050).
    NEW.delivered_at := OLD.delivered_at;
    NEW.pre_dispute_status := OLD.pre_dispute_status;
    NEW.shipped_email_sent_at := OLD.shipped_email_sent_at;
    -- The review-reminder cron's once-only stamp (this migration): an artist
    -- who set it on their own order silenced the buyer's review reminder.
    NEW.review_requested_at := OLD.review_requested_at;

    -- Stamp shipped_at ourselves on the first paid -> shipped transition;
    -- never accept a client value, never overwrite an existing stamp.
    IF NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped' AND OLD.shipped_at IS NULL THEN
      NEW.shipped_at := now();
    ELSE
      NEW.shipped_at := OLD.shipped_at;
    END IF;

    -- Transition check, not target check: only paid/shipped may move, and
    -- the only place an artist can move an order to is shipped.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF OLD.status NOT IN ('paid', 'shipped') OR NEW.status <> 'shipped' THEN
        RAISE EXCEPTION 'orders can only be advanced from paid to shipped';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- (5) artist_profiles.stripe_account_updated_at
-- ============================================================
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS stripe_account_updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION guard_artist_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_houston_verified := OLD.is_houston_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.completeness_score := OLD.completeness_score;
    NEW.stripe_onboarded := OLD.stripe_onboarded;
    NEW.stripe_account_id := OLD.stripe_account_id;
    NEW.stripe_account_updated_at := OLD.stripe_account_updated_at;
    NEW.is_live := OLD.is_live;
    NEW.application_status := OLD.application_status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.agreement_accepted_at := OLD.agreement_accepted_at;
    NEW.agreement_version := OLD.agreement_version;
  END IF;
  RETURN NEW;
END;
$$;
