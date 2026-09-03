-- L5 (ruling D7) and L12 — two order stamps that had no writer.
--
-- D7 supersedes D6. Every document in the counsel set requires signature
-- confirmation on orders of $750 or more and lists it as seller-protection
-- requirement 4 (Seller Protection req. 4, Artist Agreement §4 and §7, Terms
-- of Sale §3, Shipping). D6 waived it on 2026-09-02 only because nothing on
-- the platform could record it. The writer now exists: an admin records the
-- confirmation from the carrier's signature record at dispute time, through
-- POST /api/admin/orders/[id]/signature-confirmed.
--
-- `signature_confirmed` (boolean) already exists from 00040. What was missing
-- is WHEN and by WHOM, which is what makes it evidence rather than a claim.
--
-- Artist Agreement §4, "Accepting a dispute": an artist may tell us they do
-- not wish to contest one. `dispute_conceded_at` records that they did
-- (L12). It does not decide the dispute — support may still contest, and the
-- agreement says so — it records the artist's stated preference.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS signature_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signature_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispute_conceded_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.signature_confirmed_at IS
  'When Custom Canvas recorded signature confirmation from the carrier record (protection requirement 4). Service-role only; written by the admin signature-confirmed route.';
COMMENT ON COLUMN orders.dispute_conceded_at IS
  'When the artist said they do not wish to contest this dispute (Artist Agreement §4). A stated preference, not an outcome — support may still contest.';

-- The FK is deliberately SET NULL, matching 00049's rule for the money rows:
-- an admin leaving must not take the evidence with them. The timestamp is
-- what proves the confirmation happened; the identity is provenance.

-- Freeze the three new columns for non-privileged writers. The artist owns
-- shipping facts; these are the platform's own record, and an artist who
-- could stamp signature_confirmed_at would be granting themselves protection
-- requirement 4.
--
-- The whole function is restated from 00057 rather than patched, because
-- CREATE OR REPLACE takes the body it is given: writing only the new lines
-- would silently delete the entire transition matrix (the money freezes, the
-- evidence freezes, the shipped_at stamp, the paid->shipped check) that
-- 00050/00056/00057 built and scripts/db-smoke.sql §6 pins. Diff against
-- 00057 before editing: the ONLY additions are the three marked 00060.
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
    -- 00060 (D7): when and by whom the confirmation was recorded. The
    -- boolean was already frozen; without these two the artist could
    -- fabricate the provenance of the platform's own evidence.
    NEW.signature_confirmed_at := OLD.signature_confirmed_at;
    NEW.signature_confirmed_by := OLD.signature_confirmed_by;
    -- 00060 (L12): the artist ASKS to concede a dispute through a route that
    -- writes with the service role, so support has a record of who asked and
    -- when. Not a column they set directly.
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
    -- The review-reminder cron's once-only stamp (00056): an artist who set
    -- it on their own order silenced the buyer's review reminder.
    NEW.review_requested_at := OLD.review_requested_at;

    -- Evidence (00057). The ship-to address came from Stripe's taxed
    -- shipping details and is what the buyer's Orders page shows as "Ships
    -- to"; nobody but the platform may move it. Tracking and carrier are the
    -- artist's to set while the piece is on its way and freeze the moment
    -- they become evidence.
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
