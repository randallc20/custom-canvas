-- Oversell guard at the DB level: at most one live (unrefunded) order per
-- listing. The webhook's status check was a TOCTOU race; this makes the
-- second concurrent insert fail deterministically so it can be auto-refunded.
CREATE UNIQUE INDEX orders_one_live_per_listing
  ON orders (listing_id)
  WHERE status IN ('paid', 'shipped', 'delivered');
