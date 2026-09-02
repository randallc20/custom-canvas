-- 00049_orders_survive_account_delete.sql — R1 (docs/REVIEW-FIX-PLAN.md), 01-P0.
--
-- Self-service account deletion deletes the auth user; profiles cascades and,
-- until now, so did every orders / reviews / commissions row the person was
-- party to. A chargeback weeks later then found no order by payment intent
-- and both dispute webhooks returned 200 having done nothing.
--
-- Money rows now outlive the people in them: the party columns become
-- nullable and detach (ON DELETE SET NULL) instead of taking the row with
-- them. The money columns and Stripe ids are untouched. conversations keep
-- cascading on purpose — the order row is the record that matters.
--
-- Constraint names are recreated verbatim: the app addresses two of them as
-- PostgREST join hints (profiles!orders_buyer_id_fkey,
-- profiles!reviews_reviewer_id_fkey).
--
-- Every policy, trigger and index that touches these columns was checked
-- against NULL: the RLS clauses (buyer_id = auth.uid(), requester_id =
-- auth.uid(), auth.uid() = reviewer_id, artist_id IN (...)) evaluate to
-- NULL → row invisible to clients, still visible to admins and the service
-- role; guard_orders_update copies OLD → NEW and is null-safe;
-- set_review_artist copies a possibly-null orders.artist_id into the already
-- nullable reviews.artist_id; orders_one_live_per_listing is a partial
-- unique index on listing_id, where NULLs never collide.

-- ------------------------------------------------------------------ orders
ALTER TABLE orders ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_buyer_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE orders ALTER COLUMN artist_id DROP NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_artist_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_artist_id_fkey
  FOREIGN KEY (artist_id) REFERENCES artist_profiles(id) ON DELETE SET NULL;

-- Deviation from the plan's four-column list, forced on contact with the
-- schema: an artist's listings and commissions CASCADE away with their
-- artist_profiles row, and orders.listing_id / orders.commission_id were
-- NO ACTION. Once the order row survives the artist, those two references
-- would dangle and the whole deleteUser would fail on the FK — an artist
-- with any order at all (even delivered) could never delete. Both columns
-- were already nullable and typed nullable in src/types/order.ts.
ALTER TABLE orders DROP CONSTRAINT orders_listing_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT orders_commission_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_commission_id_fkey
  FOREIGN KEY (commission_id) REFERENCES commissions(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------- reviews
ALTER TABLE reviews ALTER COLUMN reviewer_id DROP NOT NULL;
ALTER TABLE reviews DROP CONSTRAINT reviews_reviewer_id_fkey;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey
  FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------- commissions
ALTER TABLE commissions ALTER COLUMN requester_id DROP NOT NULL;
ALTER TABLE commissions DROP CONSTRAINT commissions_requester_id_fkey;
ALTER TABLE commissions ADD CONSTRAINT commissions_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES profiles(id) ON DELETE SET NULL;
