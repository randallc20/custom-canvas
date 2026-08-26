-- The "Recently viewed" shelf reads a signed-in user's own listing_view
-- events client-side, but the only SELECT policy on analytics_events is
-- artist-scoped (00002) — so the query always returned zero rows and the
-- shelf never rendered, for anyone, since it shipped. Let viewers read
-- exactly their own events.

CREATE POLICY "Viewers can read their own events" ON analytics_events FOR SELECT
  USING (viewer_id = auth.uid());
