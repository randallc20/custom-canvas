-- 00040_seller_protection.sql
-- Seller protection, per docs/SELLER_PROTECTION_SPEC.md steps 1-3.
--
-- The bargain: the artist bears a chargeback by default; Custom Canvas absorbs
-- it only when the order was Protected at the time of sale and shipment.
--
-- The three snapshot columns are load-bearing. Listings stay editable after a
-- sale, so evaluating protection against the LIVE listing would let an artist
-- add photos the day a dispute lands and retroactively qualify. They are
-- frozen at checkout, in the same metadata block that locks the economics,
-- and frozen again here against non-privileged UPDATE.

ALTER TABLE orders
  -- Evidence the artist supplies while fulfilling.
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_confirmed BOOLEAN NOT NULL DEFAULT false,
  -- Snapshots frozen at checkout.
  ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_photo_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evidence_has_condition_notes BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fulfillment_window_days INTEGER NOT NULL DEFAULT 5,
  -- Platform-determined.
  ADD COLUMN IF NOT EXISTS protection_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS dispute_id TEXT,
  ADD COLUMN IF NOT EXISTS dispute_outcome TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_carrier_check;
ALTER TABLE orders ADD CONSTRAINT orders_carrier_check
  CHECK (carrier IS NULL OR carrier IN ('usps', 'ups', 'fedex', 'dhl'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_protection_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_protection_status_check
  CHECK (protection_status IN ('pending', 'protected', 'ineligible', 'waived'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_dispute_outcome_check;
ALTER TABLE orders ADD CONSTRAINT orders_dispute_outcome_check
  CHECK (dispute_outcome IS NULL OR dispute_outcome IN ('won', 'lost', 'accepted'));

-- Guard: extend the 00038 order guard.
--
-- Non-privileged callers (artists on their own orders) may supply fulfilment
-- EVIDENCE -- carrier and tracking_number -- and advance status. Everything
-- else is frozen:
--   * the four snapshot columns, or the retroactive-qualification hole reopens;
--   * protection_status / dispute_id / dispute_outcome, which the platform
--     determines at dispute time;
--   * signature_confirmed. This one matters: the platform ABSORBS the loss on
--     a protected order, so letting an artist self-attest a signature on a
--     $750+ sale would let them shift their own losses onto Custom Canvas.
--     Service-role only until a carrier integration can confirm it.
--   * shipped_at, which is stamped below rather than accepted from the client
--     -- otherwise it could be backdated to fake shipping inside the window.
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

    -- Seller-protection columns the artist must not be able to set.
    NEW.signature_required := OLD.signature_required;
    NEW.signature_confirmed := OLD.signature_confirmed;
    NEW.evidence_photo_count := OLD.evidence_photo_count;
    NEW.evidence_has_condition_notes := OLD.evidence_has_condition_notes;
    NEW.fulfillment_window_days := OLD.fulfillment_window_days;
    NEW.protection_status := OLD.protection_status;
    NEW.dispute_id := OLD.dispute_id;
    NEW.dispute_outcome := OLD.dispute_outcome;

    -- Stamp shipped_at ourselves on the paid -> shipped transition; never
    -- accept a client-supplied value.
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

CREATE INDEX IF NOT EXISTS orders_dispute_id_idx ON orders(dispute_id) WHERE dispute_id IS NOT NULL;
