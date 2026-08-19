-- Refund crash-safety + tax bookkeeping (PR-3 of MASTER-PLAN).
--
-- The settle-refund sequence is refund → transfer reversal → DB close. A
-- crash between the first two used to wedge the order permanently: the
-- retry re-attempted the FULL refund, Stripe rejected it (remaining
-- refundable too small), and the reversal never ran. Persisting each Stripe
-- object id as it is created lets a retry skip completed steps.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_reversal_id TEXT,
  -- Stripe Tax total for the session (all line items). The platform is
  -- merchant of record: refunds must return the tax on refunded lines.
  ADD COLUMN IF NOT EXISTS amount_tax_cents INTEGER NOT NULL DEFAULT 0;

-- These are money-linkage columns: freeze them for non-privileged writers,
-- extending the 00009 orders guard.
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
  END IF;
  RETURN NEW;
END;
$$;
