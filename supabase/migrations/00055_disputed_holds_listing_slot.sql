-- 00055_disputed_holds_listing_slot.sql
-- R13 (docs/reviews/04-money-r2.md, P3 "a disputed order does not hold the
-- one-live-order slot").
--
-- orders_one_live_per_listing (00010) covered paid/shipped/delivered only, so
-- a chargeback-frozen order left the piece free: the artist could relist it,
-- a second buyer's insert succeeded, and the eventual won-restore of the
-- first order to `paid` then violated the index (the second order holds it)
-- — a 500 Stripe retried for three days before giving up, leaving the order
-- `disputed` forever. A disputed order still occupies the piece: it is in
-- the index now, so the second insert 23505s and is auto-refunded as an
-- oversell like any other double sale.
--
-- Same name, dropped and recreated: nothing references the index by name
-- except scripts/db-smoke.sql, which pins the new definition.
--
-- Self-collision: the freeze (paid -> disputed) and the restore
-- (disputed -> paid/shipped/delivered) are UPDATEs of the SAME row, which is
-- already the row in the index for that listing — a unique index only
-- rejects a DIFFERENT row with the same key, so neither transition can
-- collide with itself. The two relist counts (charge.refunded, admin settle)
-- read the same status set so they never relist under a disputed order.

DROP INDEX IF EXISTS orders_one_live_per_listing;
CREATE UNIQUE INDEX orders_one_live_per_listing
  ON orders (listing_id)
  WHERE status IN ('paid', 'shipped', 'delivered', 'disputed');
