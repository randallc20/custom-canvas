-- L7 — the missed-window path: a new date, or the buyer's own cancellation.
--
-- Terms of Sale §3 and §7, Artist Agreement §7, Shipping "If your piece is
-- never shipped": an artist who cannot ship within 5 business days must tell
-- the buyer BEFORE the window expires and offer either a new date or a
-- cancellation. If the buyer does not agree to the new date, "they may cancel
-- for a full refund and we will settle it whether or not you approve". If the
-- artist is unreachable for five business days after we ask, Custom Canvas
-- cancels and refunds. The artist may also cancel before shipping.
--
-- Terms of Sale §3 is not merely a policy here: the Artist Agreement points
-- at the federal mail-and-internet-order rule, which requires a seller who
-- cannot ship in the promised time to obtain the buyer's consent to the delay
-- or refund them promptly. The shipping window shown on the listing IS that
-- promise.
--
-- What existed: the buyer's only action was "Request a refund", which posts a
-- message and waits for the artist. Nothing ran when a window passed. An
-- artist who simply stopped answering left the buyer with a charge, no piece,
-- and no route that did not depend on the artist choosing to act.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS proposed_ship_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_missed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_nudged_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.proposed_ship_by IS
  'A new ship-by date the artist offered after missing the original window (Artist Agreement §7). The buyer may accept it or cancel for a full refund; it does NOT extend the seller-protection window, which stays tied to the original 5 business days.';
COMMENT ON COLUMN orders.window_missed_at IS
  'When the buyer was first shown that the fulfilment window had passed. Set by the cron.';
COMMENT ON COLUMN orders.platform_nudged_at IS
  'When Custom Canvas asked the artist to ship or offer a date. Five business days after this with no artist message and no shipment, the cron cancels and refunds (Shipping, "If your piece is never shipped").';

-- The cron reads unshipped paid orders by age. Without this it is a full scan
-- of orders every night; with it, the nightly pass touches only the rows that
-- can possibly qualify.
CREATE INDEX IF NOT EXISTS orders_paid_unshipped_idx
  ON orders (created_at)
  WHERE status = 'paid' AND shipped_at IS NULL;

-- Restated in full from 00061 — CREATE OR REPLACE takes the body it is given,
-- and a partial body would delete the transition matrix. The ONLY additions
-- here are the three marked 00062.
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
    -- 00061: the money decision and its provenance.
    NEW.refund_reason := OLD.refund_reason;
    NEW.refund_initiated_by := OLD.refund_initiated_by;
    -- 00062 (L7): the platform's own fulfilment-window bookkeeping. The
    -- artist PROPOSES a new date through a route (which posts the system
    -- message and emails the buyer with it); they do not write the column,
    -- or a silent edit would move a promise the buyer already relied on.
    NEW.proposed_ship_by := OLD.proposed_ship_by;
    NEW.window_missed_at := OLD.window_missed_at;
    NEW.platform_nudged_at := OLD.platform_nudged_at;

    NEW.is_pickup := OLD.is_pickup;
    NEW.signature_required := OLD.signature_required;
    NEW.signature_confirmed := OLD.signature_confirmed;
    -- 00060 (D7).
    NEW.signature_confirmed_at := OLD.signature_confirmed_at;
    NEW.signature_confirmed_by := OLD.signature_confirmed_by;
    -- 00060 (L12).
    NEW.dispute_conceded_at := OLD.dispute_conceded_at;
    NEW.evidence_photo_count := OLD.evidence_photo_count;
    NEW.evidence_has_condition_notes := OLD.evidence_has_condition_notes;
    NEW.fulfillment_window_days := OLD.fulfillment_window_days;
    NEW.protection_status := OLD.protection_status;
    NEW.dispute_id := OLD.dispute_id;
    NEW.dispute_outcome := OLD.dispute_outcome;
    -- The webhook's record of what dispute_id means (00057).
    NEW.dispute_status := OLD.dispute_status;
    NEW.pickup_confirmed_by_buyer_at := OLD.pickup_confirmed_by_buyer_at;
    NEW.pickup_confirmed_by_artist_at := OLD.pickup_confirmed_by_artist_at;

    -- Server-stamped, platform-owned (00050).
    NEW.delivered_at := OLD.delivered_at;
    NEW.pre_dispute_status := OLD.pre_dispute_status;
    NEW.shipped_email_sent_at := OLD.shipped_email_sent_at;
    -- The review-reminder cron's once-only stamp (00056).
    NEW.review_requested_at := OLD.review_requested_at;

    -- Evidence (00057).
    NEW.shipping_address := OLD.shipping_address;
    IF OLD.status IN ('delivered', 'disputed', 'refunded') THEN
      NEW.tracking_number := OLD.tracking_number;
      NEW.carrier := OLD.carrier;
    END IF;

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

-- Two notification types for this path. `order_delayed` is the artist's
-- proposed date and the platform's nudge; `order_cancelled` is a cancellation
-- and its refund. Reusing `refund_approved` for a cancellation would put "the
-- artist approved your refund" in a buyer's bell for a refund the artist
-- never approved, which is the opposite of what happened.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent', 'new_listing',
  'price_drop', 'houston_verified', 'refund_approved', 'artist_application',
  'artist_approved', 'artist_rejected', 'order_disputed',
  -- 00062 (L7)
  'order_delayed', 'order_cancelled'
]));
