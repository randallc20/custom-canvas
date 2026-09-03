-- L8 — returns.
--
-- Terms of Sale §5, Shipping "Returning the artwork", Artist Agreement §8:
-- "A refund may be conditioned on your returning the artwork unless Custom
-- Canvas determines that a return is unlawful, unsafe, impracticable, or
-- unnecessary. Custom Canvas will provide return instructions, including the
-- return address and any required tracking or insurance." Ship within seven
-- calendar days of authorisation; the refund may be issued after delivery and
-- reasonable inspection; the buyer may not keep both the piece and the money.
--
-- None of it existed. A refund settled the moment the artist approved it, so
-- a change-of-mind buyer kept the artwork and the money.
--
-- DESIGN CONSTRAINT, and the reason this is a separate table rather than two
-- new statuses: the order status machine (paid/shipped/delivered/disputed/
-- refunded), its guard, the one-live-order-per-listing index and the whole
-- dispute lifecycle were hardened last week and every one of them keys on
-- `status`. A return is orthogonal to where the order is — it is a thing
-- that may be required before the refund settles — so it gets its own record
-- and touches none of that.

CREATE TABLE IF NOT EXISTS order_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One return per order. A second return on the same order is a support
  -- conversation, not a row.
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  -- Whether the refund is CONDITIONED on the piece coming back. False for a
  -- piece that never arrived or was lost — there is nothing to return.
  required BOOLEAN NOT NULL DEFAULT true,
  -- Mirrors orders.refund_reason (00061): the reason decides who ordinarily
  -- bears return shipping, which the instructions state.
  reason TEXT CHECK (reason IS NULL OR reason IN (
    'change_of_mind', 'not_shipped', 'lost_in_transit', 'damaged',
    'not_as_described', 'platform_error', 'artist_cancelled'
  )),
  authorized_at TIMESTAMPTZ,
  authorized_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Ruling D9: supplied by the artist when they approve a change-of-mind
  -- refund, or by Custom Canvas when we authorise a fault return. Stored
  -- here, shown to the buyer only once authorised, and NEVER taken from the
  -- artist's public profile — a public studio address is not a thing an
  -- artist has agreed to publish.
  return_address JSONB,
  -- authorized_at + 7 CALENDAR days (Terms of Sale §5: "within seven
  -- calendar days after authorization" — calendar, not business).
  ship_by TIMESTAMPTZ,
  instructions TEXT,
  tracking_number TEXT,
  carrier TEXT,
  shipped_back_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  inspection_outcome TEXT CHECK (inspection_outcome IS NULL OR inspection_outcome IN ('accepted', 'rejected')),
  inspection_notes TEXT,
  -- The four grounds the documents give for not requiring a return.
  waived_at TIMESTAMPTZ,
  waived_reason TEXT CHECK (waived_reason IS NULL OR waived_reason IN (
    'unlawful', 'unsafe', 'impracticable', 'unnecessary'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_returns IS
  'A return the refund may be conditioned on (L8). Deliberately NOT an order status: the status machine, its guard, the one-live-order index and the dispute lifecycle all key on orders.status, and a return is orthogonal to where the order is.';
COMMENT ON COLUMN order_returns.ship_by IS
  'authorized_at + 7 CALENDAR days (Terms of Sale §5). Calendar, not business days — the document says calendar.';
COMMENT ON COLUMN order_returns.waived_reason IS
  'The four grounds the documents allow for not requiring a return: unlawful, unsafe, impracticable, unnecessary.';

DROP TRIGGER IF EXISTS order_returns_updated_at ON order_returns;
CREATE TRIGGER order_returns_updated_at
  BEFORE UPDATE ON order_returns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;

-- The buyer and the order's artist may READ their own return; nobody writes
-- from a client. Every field here is either a money decision (waived,
-- inspection) or an instruction the platform gave (address, ship-by), and the
-- one thing a buyer legitimately supplies — the return tracking number — goes
-- through POST /api/orders/[id]/return-shipped so it is stamped with a
-- server timestamp rather than a client's idea of one.
DROP POLICY IF EXISTS "Return parties can view" ON order_returns;
CREATE POLICY "Return parties can view" ON order_returns
  FOR SELECT USING (
    is_privileged()
    OR EXISTS (
      SELECT 1 FROM orders o
       WHERE o.id = order_returns.order_id
         AND (
           o.buyer_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM artist_profiles ap
              WHERE ap.id = o.artist_id AND ap.profile_id = auth.uid()
           )
         )
    )
  );

REVOKE ALL ON order_returns FROM anon, authenticated;
GRANT SELECT ON order_returns TO authenticated;

CREATE INDEX IF NOT EXISTS order_returns_open_idx
  ON order_returns (ship_by)
  WHERE received_at IS NULL AND waived_at IS NULL;
