-- 00051_indexes_and_read_rpcs.sql
-- Review-fix phase R7 (the physical data layer) — docs/REVIEW-FIX-PLAN.md;
-- findings 02-P2 x9 (docs/reviews/02-scale-data.md, coverage table).
--
-- 1. Indexes: 48 migrations produced four non-unique indexes and none on the
--    foreign keys the read paths filter by. Every bold row of 02's coverage
--    table lands here. Plain CREATE INDEX (not CONCURRENTLY): the file runs
--    inside psql's transaction and every table is small today.
-- 2. Three read RPCs, all SECURITY INVOKER so the caller's RLS still decides
--    which rows exist. Each replaces a client-side pattern that downloaded
--    rows to count them (spotlight: every available listing; unread badges:
--    every unread message, with every conversation id in the URL; Studio
--    totals: every order, silently capped at PostgREST's max_rows).
--
-- No policy or grant on a table changes here (R8 owns the analytics_events
-- INSERT policy); the only grants are EXECUTE on the new functions.

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------

-- Every `images:listing_images(*)` embed is a correlated lateral aggregate;
-- without this each parent row sequentially scanned the whole images table.
CREATE INDEX IF NOT EXISTS listing_images_listing_idx
  ON listing_images (listing_id, display_order);

-- Feed default sort (status filter + created_at DESC, id DESC tiebreak).
CREATE INDEX IF NOT EXISTS listings_status_created_idx
  ON listings (status, created_at DESC);

-- Artist page, artist listings, related listings.
CREATE INDEX IF NOT EXISTS listings_artist_created_idx
  ON listings (artist_id, created_at DESC);

-- /orders (buyer) and Studio (artist).
CREATE INDEX IF NOT EXISTS orders_buyer_created_idx
  ON orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_artist_created_idx
  ON orders (artist_id, created_at DESC);

-- Inbox list, findOrCreate, and the messages RLS subquery (which Realtime
-- evaluates once per subscriber per change).
CREATE INDEX IF NOT EXISTS conversations_participant_one_idx
  ON conversations (participant_one);
CREATE INDEX IF NOT EXISTS conversations_participant_two_idx
  ON conversations (participant_two);

-- Commission lookups by thread, by artist, by requester.
CREATE INDEX IF NOT EXISTS commissions_conversation_idx
  ON commissions (conversation_id);
CREATE INDEX IF NOT EXISTS commissions_artist_idx
  ON commissions (artist_id);
CREATE INDEX IF NOT EXISTS commissions_requester_idx
  ON commissions (requester_id);

-- follows PK leads with follower_id; follower counts, the new-listing
-- trigger and the email fan-out all filter by artist_id.
CREATE INDEX IF NOT EXISTS follows_artist_idx
  ON follows (artist_id);

-- saved_listings PK leads with profile_id; the price-drop trigger and
-- fan-out filter by listing_id.
CREATE INDEX IF NOT EXISTS saved_listings_listing_idx
  ON saved_listings (listing_id);

-- Unread counts and the navbar badge only ever look at unread rows.
CREATE INDEX IF NOT EXISTS messages_unread_idx
  ON messages (conversation_id) WHERE is_read = false;

-- "Recently viewed" shelf: the viewer's own listing views, newest first.
-- Partial so anonymous and profile-view rows (the bulk of the table) never
-- enter it.
CREATE INDEX IF NOT EXISTS analytics_events_viewer_listing_idx
  ON analytics_events (viewer_id, created_at DESC)
  WHERE event_type = 'listing_view' AND listing_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Read RPCs (SECURITY INVOKER: RLS applies exactly as for a direct select)
-- ---------------------------------------------------------------------------

-- Neighborhood spotlight: one row per neighborhood with available work from
-- live artists, optionally scoped to a city (same prefix match as
-- cityMatchPattern in src/lib/location.ts: "Houston" matches "Houston, TX").
-- The caller applies the minimum-listings threshold; this just counts.
CREATE OR REPLACE FUNCTION neighborhood_listing_counts(p_city text DEFAULT NULL)
RETURNS TABLE (neighborhood text, listing_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT ap.neighborhood, count(*) AS listing_count
  FROM listings l
  JOIN artist_profiles ap ON ap.id = l.artist_id
  WHERE l.status = 'available'
    AND ap.is_live = true
    AND ap.neighborhood IS NOT NULL
    AND (p_city IS NULL OR btrim(p_city) = ''
         OR ap.city ILIKE replace(replace(replace(btrim(p_city), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  GROUP BY ap.neighborhood
  ORDER BY ap.neighborhood;
$$;

-- Inbox unread badges: unread messages someone else sent, per conversation,
-- for the caller's own threads. Replaces messages?conversation_id=in.(...)
-- with every conversation id in the query string, polled every 30 s.
CREATE OR REPLACE FUNCTION my_unread_counts()
RETURNS TABLE (conversation_id uuid, unread bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.conversation_id, count(*) AS unread
  FROM messages m
  WHERE m.is_read = false
    AND m.sender_id <> auth.uid()
    AND m.conversation_id IN (
      SELECT c.id FROM conversations c
      WHERE c.participant_one = auth.uid() OR c.participant_two = auth.uid())
  GROUP BY m.conversation_id;
$$;

-- Studio money totals: payout and order count per status for one artist.
-- The orders SELECT policies (own artist row, own buyer row, admin) still
-- apply through the invoker, so a stranger's artist_id returns no rows.
CREATE OR REPLACE FUNCTION artist_sales_totals(p_artist_id uuid)
RETURNS TABLE (status text, order_count bigint, payout_cents bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT o.status, count(*) AS order_count, coalesce(sum(o.artist_payout_cents), 0)::bigint AS payout_cents
  FROM orders o
  WHERE o.artist_id = p_artist_id
  GROUP BY o.status;
$$;

-- Supabase's default privileges hand EXECUTE on every new public function
-- to anon and authenticated; revoke explicitly so the grants below are the
-- whole story (PUBLIC alone would leave the anon grant in place).
REVOKE ALL ON FUNCTION neighborhood_listing_counts(text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION my_unread_counts() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION artist_sales_totals(uuid) FROM public, anon, authenticated;

-- The spotlight is on the anonymous homepage; the other two are for signed-in
-- callers only.
GRANT EXECUTE ON FUNCTION neighborhood_listing_counts(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION my_unread_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION artist_sales_totals(uuid) TO authenticated;
