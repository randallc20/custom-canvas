-- Fixes a P1 and two P2s from the auth review pass r5.
--
-- (1) Marking a notice `withdrawn` or `defective` AFTER the material was
--     removed stranded the listing for ever: those two statuses were a bare
--     status stamp that touched the listing not at all, no card branch
--     matched them so the admin was left with no buttons, and the artist
--     could neither republish (guard_listings_update raises) nor delete
--     (guard_listings_delete raises) — with their images in a private bucket
--     and support's own tool unable to help. Both are now full undo paths.
--
-- (2) The quarantined storage paths lived on the NOTICE row, so a restore
--     driven by any other notice against the same listing republished it with
--     its images still locked away. They belong to the LISTING, which is what
--     was actually removed.
--
-- (3) The 10-business-day restore window was measured from the notice's
--     arrival rather than from the counter-notice, which is what §512(g)
--     actually keys it to — so it opened up to two weeks early or late
--     depending on when the counter-notice landed.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dmca_quarantined_paths TEXT[];

COMMENT ON COLUMN listings.dmca_quarantined_paths IS
  'Storage paths moved into the private dmca-quarantine bucket when this listing was removed on a copyright notice (00069). On the listing, not the notice: a second notice against the same piece must not be able to restore it with its images still locked away.';

ALTER TABLE dmca_notices
  ADD COLUMN IF NOT EXISTS counter_received_at TIMESTAMPTZ;

COMMENT ON COLUMN dmca_notices.counter_received_at IS
  'When a substantially compliant counter-notice arrived. The 10-to-14-business-day restoration window runs from HERE (17 U.S.C. §512(g)), not from the original notice.';

-- Carry over anything the previous shape recorded.
UPDATE listings l
   SET dmca_quarantined_paths = n.quarantined_paths
  FROM dmca_notices n
 WHERE n.listing_id = l.id
   AND n.quarantined_paths IS NOT NULL
   AND l.dmca_quarantined_paths IS NULL;

-- The new column is the platform's, like the rest of the DMCA state.
-- Restated from 00067; the ONLY addition is the line marked 00069.
CREATE OR REPLACE FUNCTION guard_listings_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.dmca_removed_at := OLD.dmca_removed_at;
    NEW.pre_dmca_status := OLD.pre_dmca_status;
    -- 00069
    NEW.dmca_quarantined_paths := OLD.dmca_quarantined_paths;
    IF OLD.dmca_removed_at IS NOT NULL THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'this listing was removed following a copyright notice; write to support@customcanvas.shop';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
