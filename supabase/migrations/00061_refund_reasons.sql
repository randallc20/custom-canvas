-- L6 — why a refund happened, and who asked for it.
--
-- Terms of Sale §2 and §5, Artist Agreement §8 and the Shipping policy all
-- draw the same line: on a discretionary CHANGE-OF-MIND return the service fee
-- and its tax are kept; but if the order was never shipped, was lost in
-- transit, arrived materially damaged, or was materially not as described, the
-- fee is REFUNDED. Terms of Sale §2A adds the platform's own obvious-error
-- cancellation, which returns "all amounts collected".
--
-- calculateRefundSplit retained the fee unconditionally and the settle route
-- had no notion of a reason, so every refund was priced as change-of-mind —
-- including the ones the documents say we pay for.
--
-- The reason also decides whether artist approval is needed at all. Artist
-- Agreement §8: "Approving a refund is your decision, not ours — with four
-- exceptions." A fault reason is that exception, and the settle route uses
-- this column to allow settling without `refund_approved_at`.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_reason TEXT
    CHECK (refund_reason IS NULL OR refund_reason IN (
      'change_of_mind',    -- discretionary; fee retained
      'not_shipped',       -- fault; whole charge returned
      'lost_in_transit',   -- fault
      'damaged',           -- fault
      'not_as_described',  -- fault
      'platform_error',    -- fault (ToSale §2A obvious pricing/tax error)
      'artist_cancelled'   -- fault; the artist cancelled before shipping
    )),
  ADD COLUMN IF NOT EXISTS refund_initiated_by TEXT
    CHECK (refund_initiated_by IS NULL OR refund_initiated_by IN ('artist', 'buyer', 'platform'));

COMMENT ON COLUMN orders.refund_reason IS
  'Why this order was refunded. Decides the money split: change_of_mind keeps the service fee and its tax, every other reason returns the whole charge (Terms of Sale §2, Artist Agreement §8). Also decides whether artist approval was required.';
COMMENT ON COLUMN orders.refund_initiated_by IS
  'Who set the refund in motion: the artist approving one, the buyer exercising a right they hold outright, or the platform acting on its own (an unreachable artist, an obvious pricing error).';

-- Both are the platform's record of a money decision, frozen for
-- non-privileged writers exactly like the rest of the refund bookkeeping.
-- An artist who could write refund_reason could relabel a fault refund as
-- change of mind and keep the buyer's service fee from being returned.
--
-- Restated in full from 00060 — CREATE OR REPLACE takes the body it is given,
-- and a partial body would delete the transition matrix. The ONLY additions
-- here are the two marked 00061.
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
