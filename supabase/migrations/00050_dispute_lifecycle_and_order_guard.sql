-- 00050_dispute_lifecycle_and_order_guard.sql
-- Review-fix phases R2 (webhook dispute lifecycle) and R3 (order guard and
-- seller protection) — docs/REVIEW-FIX-PLAN.md; findings 04-P1 x2, 04-P2
-- (guard checks target not transition), 04-P2 (won dispute regresses
-- shipped), 04-P2 (delivery self-attestation, ruling D1), 01/04 appendix
-- (notify-shipped re-sends).
--
-- 1. pre_dispute_status: the status an order held when a chargeback froze it.
--    The closed-dispute handler restored `delivered_at ? delivered : paid`,
--    which sent a refunded order back to `paid` and an in-transit order back
--    to `paid` (re-marking it shipped then re-stamped shipped_at weeks late).
--    Persisting the state at dispute time is cheaper and more honest than
--    re-deriving it from side columns.
-- 2. shipped_email_sent_at: once-only stamp for the buyer's "your order
--    shipped" email; the route had no guard and every call re-sent it.
-- 3. guard_orders_update: the status rule checked the TARGET state only, so
--    an artist could move a refunded or disputed order to shipped/delivered
--    and re-occupy orders_one_live_per_listing (auto-refunding every later
--    buyer). Now the transition is checked: a non-privileged status change is
--    allowed only from paid/shipped, and only to shipped. `delivered` is
--    reached through /api/orders/[id]/mark-delivered (service role, after an
--    ownership check), so delivered_at is frozen for everyone else — the
--    same reasoning as shipped_at in 00040. shipped_at is stamped only when
--    it is still NULL, so a restored order re-marked shipped keeps its
--    original fulfilment-window evidence.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pre_dispute_status TEXT,
  ADD COLUMN IF NOT EXISTS shipped_email_sent_at TIMESTAMPTZ;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pre_dispute_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_pre_dispute_status_check
  CHECK (pre_dispute_status IS NULL
         OR pre_dispute_status IN ('pending', 'paid', 'shipped', 'delivered', 'refunded'));

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
    NEW.pickup_confirmed_by_buyer_at := OLD.pickup_confirmed_by_buyer_at;
    NEW.pickup_confirmed_by_artist_at := OLD.pickup_confirmed_by_artist_at;

    -- Server-stamped, platform-owned (this migration).
    NEW.delivered_at := OLD.delivered_at;
    NEW.pre_dispute_status := OLD.pre_dispute_status;
    NEW.shipped_email_sent_at := OLD.shipped_email_sent_at;

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
