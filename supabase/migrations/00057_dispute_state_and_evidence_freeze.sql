-- 00057_dispute_state_and_evidence_freeze.sql
-- R15 (docs/reviews/04-money-r3.md): P1 "inquiry escalates after a platform
-- refund", P3 "three evidence columns stay artist-writable", P3 "a won
-- dispute re-stamps delivered_at".
--
-- Applies AFTER 00056 (R14): this redefines guard_orders_update and carries
-- 00056's review_requested_at freeze forward.
--
-- 1. orders.dispute_status — the last Stripe dispute status seen for
--    dispute_id. The row held one dispute id and one outcome, so an inquiry
--    recorded as `warning_needs_response` and a chargeback recorded after a
--    refund were the same fact ("we have this id"); the escalation of that
--    inquiry after the platform's own refund — the one event an admin must
--    act on — was dropped as a redelivery. With the status on the row the
--    webhook can tell "recorded as an inquiry, now needs_response" from a
--    true duplicate. Frozen for non-privileged writers like dispute_id.
--
-- 2. Evidence freeze. 00040/00050 froze every money, party and snapshot
--    column but left shipping_address, tracking_number and carrier writable
--    by the artist at every status — including `disputed`, when they are the
--    evidence the platform submits under its own name. shipping_address has
--    no legitimate artist edit at all (Stripe wrote it; the Studio never
--    does): always copied from OLD. tracking_number/carrier are legitimately
--    set on the paid -> shipped transition (the Ship Order modal writes them
--    in the same UPDATE as the status change) and a typo fix on a shipped
--    order is fine; they freeze once the order is delivered, disputed or
--    refunded.
--
-- 3. set_order_delivered_at (00022) fired on ANY transition into
--    `delivered`, so a won dispute's restore (`disputed -> delivered`,
--    privileged) re-stamped delivered_at to the day the dispute closed.
--    Stamp only when it is still NULL, as 00050 does for shipped_at.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS dispute_status TEXT;

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
    -- The webhook's record of what dispute_id means (this migration).
    NEW.dispute_status := OLD.dispute_status;
    NEW.pickup_confirmed_by_buyer_at := OLD.pickup_confirmed_by_buyer_at;
    NEW.pickup_confirmed_by_artist_at := OLD.pickup_confirmed_by_artist_at;

    -- Server-stamped, platform-owned (00050).
    NEW.delivered_at := OLD.delivered_at;
    NEW.pre_dispute_status := OLD.pre_dispute_status;
    NEW.shipped_email_sent_at := OLD.shipped_email_sent_at;
    -- The review-reminder cron's once-only stamp (00056): an artist who set
    -- it on their own order silenced the buyer's review reminder.
    NEW.review_requested_at := OLD.review_requested_at;

    -- Evidence (this migration). The ship-to address came from Stripe's
    -- taxed shipping details and is what the buyer's Orders page shows as
    -- "Ships to"; nobody but the platform may move it. Tracking and carrier
    -- are the artist's to set while the piece is on its way and freeze the
    -- moment they become evidence.
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

-- Delivery is stamped once. A restore from `disputed` back to `delivered`
-- (a won chargeback on a delivered order) keeps the original date — that
-- date is requirement-3 evidence and what any later evidence pack quotes.
CREATE OR REPLACE FUNCTION set_order_delivered_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND OLD.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;
