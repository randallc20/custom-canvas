-- 00041_order_is_pickup.sql
-- Protection evaluation was inferring "pickup" from a missing shipping_address.
-- That is wrong in both directions: a shipped order whose address is absent
-- (legacy rows, or any future gap) would be routed down the PICKUP branch,
-- which short-circuits every shipping requirement and asks only for a handoff
-- confirmation. Persist the flag the checkout session already knows instead of
-- guessing from a nullable column.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_pickup BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing rows with no shipping address were pickup under the old
-- (inferred) behaviour, so preserve their evaluation rather than silently
-- re-classifying historical orders.
UPDATE orders SET is_pickup = true WHERE shipping_address IS NULL AND is_pickup = false;

-- Frozen at checkout like the other snapshots — an artist must not be able to
-- flip an order onto the easier pickup path.
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

    IF NEW.status = 'shipped' AND OLD.status IS DISTINCT FROM 'shipped' THEN
      NEW.shipped_at := now();
    ELSE
      NEW.shipped_at := OLD.shipped_at;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('shipped', 'delivered') THEN
      RAISE EXCEPTION 'orders can only be advanced to shipped or delivered';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
