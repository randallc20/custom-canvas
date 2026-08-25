-- 00042_ai_disclosure_and_pickup_handoff.sql
-- Closes the two gaps where the settled policy had no mechanism behind it.
--
-- 1. AI disclosure. The Authenticity Policy permits AI-ASSISTED work with
--    disclosure and prohibits wholly generated work. A policy an artist has to
--    remember to volunteer is one they will forget, so it is asked at listing
--    time and stored, not left to the description.
-- 2. Pickup handoff. Seller protection short-circuits for pickup orders:
--    protected only when BOTH parties confirm handoff. There was no way to
--    confirm, so every pickup order evaluated as ineligible — pickup-only
--    artists had no protection at all.

-- ---------------------------------------------------------------- AI
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ai_involvement TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS ai_disclosure TEXT;

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_ai_involvement_check;
ALTER TABLE listings ADD CONSTRAINT listings_ai_involvement_check
  CHECK (ai_involvement IN ('none', 'assisted'));

-- If the artist declares AI assistance they must say what they contributed.
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_ai_disclosure_required;
ALTER TABLE listings ADD CONSTRAINT listings_ai_disclosure_required
  CHECK (
    ai_involvement <> 'assisted'
    OR (ai_disclosure IS NOT NULL AND length(btrim(ai_disclosure)) >= 20)
  );

-- ------------------------------------------------------------ pickup handoff
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_confirmed_by_buyer_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pickup_confirmed_by_artist_at TIMESTAMPTZ;

-- Both columns are set ONLY through /api/orders/[id]/confirm-pickup, which
-- establishes which party is calling and stamps that party's column with the
-- service-role client. Freezing them here means an artist cannot confirm on the
-- buyer's behalf and so cannot manufacture protection on a pickup sale — the
-- same reasoning as signature_confirmed in 00040.
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
