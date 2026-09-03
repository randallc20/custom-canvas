-- Fixes three P1s from the auth review pass r3 (docs/reviews/01-auth-access-r3.md).
--
-- (1) An artist could stamp and BACKDATE their own Artist Agreement
--     acceptance. `agreement_accepted_at` and `agreement_version` were
--     supplied by the browser in the artist_profiles INSERT;
--     `guard_artist_profiles_insert` forced is_live, application_status and
--     the review columns but said nothing about these two, and 00037's UPDATE
--     freeze then made the forged stamp permanent. One PostgREST call
--     recorded acceptance of an agreement that was never rendered, at a date
--     of the account's choosing — and since L2 that value also clears the
--     acceptance gate and the submit-for-review re-check.
--
--     This is the exact thing 00058 refuses to do for the Terms of Service
--     ("recording an acceptance that never happened is the one thing this
--     record exists to prevent"). The two halves of the acceptance record now
--     agree: both are written by the server, from the server's constants.
--
-- (2) A DMCA-removed listing could be DELETED by the artist. The 00065 guard
--     is BEFORE UPDATE only, so the stamp that stops republishing did not
--     stop deleting — and `dmca_notices.listing_id` is ON DELETE SET NULL, so
--     the notice detached and the record of what was removed left the file
--     the safe harbour rests on. The artist re-uploads the same images that
--     afternoon.
--
-- (3) `remove_material` recorded no prior status and `restore` forced
--     'available', so a notice against a SOLD piece put it back on sale. The
--     next buyer pays for a painting that shipped weeks ago, the order insert
--     hits orders_one_live_per_listing, and the webhook auto-refunds them
--     with the platform eating the processing fees. `pre_dmca_status` is the
--     same shape as `orders.pre_dispute_status` (00053), which exists for
--     exactly this reason.

-- ---------------------------------------------------------------------------
-- (1) The Artist Agreement acceptance is the server's to write.
-- ---------------------------------------------------------------------------
-- Restated from 00032 — CREATE OR REPLACE takes the body it is given, and
-- rebuilding from an older one is how the signup role sanitiser got reverted
-- two migrations ago. Diff against 00032: the ONLY additions are the two
-- lines marked 00067.
CREATE OR REPLACE FUNCTION guard_artist_profiles_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_live := false;
    NEW.application_status := 'draft';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.is_houston_verified := false;
    NEW.is_featured := false;
    -- 00067: acceptance is a legal record. The browser used to supply both of
    -- these at INSERT; onboarding now posts to /api/account/acceptance, which
    -- stamps them with the service role from ARTIST_AGREEMENT_VERSION.
    NEW.agreement_accepted_at := NULL;
    NEW.agreement_version := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- (2) A DMCA-removed listing cannot be deleted by its artist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_listings_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() AND OLD.dmca_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'this listing was removed following a copyright notice and cannot be deleted; write to support@customcanvas.shop';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_listings_delete_trg ON listings;
CREATE TRIGGER guard_listings_delete_trg
  BEFORE DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION guard_listings_delete();

-- Even a privileged delete must not orphan the notice: the file is what the
-- safe harbour rests on, and "which listing was this about" is not a detail
-- to lose. RESTRICT rather than SET NULL — an admin who genuinely needs the
-- listing gone can detach the notice deliberately first.
ALTER TABLE dmca_notices DROP CONSTRAINT IF EXISTS dmca_notices_listing_id_fkey;
ALTER TABLE dmca_notices
  ADD CONSTRAINT dmca_notices_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- (3) Restore to what it WAS, not to 'available'.
-- ---------------------------------------------------------------------------
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS pre_dmca_status TEXT;

COMMENT ON COLUMN listings.pre_dmca_status IS
  'The status the listing held when a copyright notice removed it (00067). Restored to this, never to ''available'' — a notice against a SOLD piece would otherwise put it back on sale. Same shape as orders.pre_dispute_status.';

CREATE OR REPLACE FUNCTION guard_listings_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.dmca_removed_at := OLD.dmca_removed_at;
    NEW.pre_dmca_status := OLD.pre_dmca_status;
    IF OLD.dmca_removed_at IS NOT NULL THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'this listing was removed following a copyright notice; write to support@customcanvas.shop';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
