-- Fixes a P1 from the money review pass r5 (docs/reviews/04-money-r5.md).
--
-- L7's `accept-ship-by` recorded the buyer's consent to a later date by
-- widening `orders.fulfillment_window_days`. That column is the ONLY input to
-- seller-protection requirement 1: `evaluateProtection` fails requirement 1
-- when businessDaysBetween(created_at, shipped_at) > fulfillment_window_days.
-- So an artist who missed the window, proposed a date a month out and got a
-- "yes" had requirement 1 rewritten in their favour — and if the buyer later
-- filed a non-receipt chargeback, Custom Canvas absorbed a loss the artist
-- should have borne. The artist could buy protection back by asking for more
-- time, which the propose modal, the buyer's card, the artist's badge and
-- 00062's own comment all promise cannot happen.
--
-- It was also the wrong unit: the route wrote a CALENDAR-day count into a
-- BUSINESS-day column, so a 30-day agreement displayed as "ship by" two weeks
-- later than the date the buyer actually accepted.
--
-- The consent needs its own home. `agreed_ship_by` is read by the prompts,
-- the buyer's cancel right and the cron; `fulfillment_window_days` goes back
-- to being the checkout snapshot that nothing rewrites after the sale.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS agreed_ship_by TIMESTAMPTZ;

COMMENT ON COLUMN orders.agreed_ship_by IS
  'A later ship-by date the BUYER accepted (Artist Agreement §7 / the federal mail-order consent rule). Read by the order cards, the buyer''s cancel right and the fulfilment cron. It deliberately does NOT touch fulfillment_window_days: seller-protection requirement 1 is measured against the original promise, always.';

-- Undo the damage on any row that already took the widened value. There are
-- no real orders on prod yet and this arc has not been deployed, so this is
-- belt and braces for DEV rows and for a re-run.
UPDATE orders
   SET fulfillment_window_days = 5
 WHERE fulfillment_window_days IS DISTINCT FROM 5
   AND proposed_ship_by IS NOT NULL;

-- Frozen for non-privileged writers like the rest of the fulfilment
-- bookkeeping: an artist who could stamp the buyer's consent could grant
-- themselves the delay the buyer never agreed to. Restated in full from
-- 00062 — CREATE OR REPLACE takes the body it is given, and a partial body
-- would delete the transition matrix. The ONLY addition is the line marked
-- 00066.
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
    -- 00062 (L7): the platform's own fulfilment-window bookkeeping.
    NEW.proposed_ship_by := OLD.proposed_ship_by;
    NEW.window_missed_at := OLD.window_missed_at;
    NEW.platform_nudged_at := OLD.platform_nudged_at;
    -- 00066: the buyer's consent to a later date.
    NEW.agreed_ship_by := OLD.agreed_ship_by;

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
    -- The checkout snapshot of the shipping promise. Seller-protection
    -- requirement 1 is measured against it and nothing rewrites it after the
    -- sale — not even the buyer agreeing to a later date (00066).
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
