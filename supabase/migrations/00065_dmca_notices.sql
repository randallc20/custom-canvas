-- L11 — DMCA operations.
--
-- The DMCA policy commits to a process: remove properly-noticed material,
-- notify the affected user, forward a counter-notice, restore "not less than
-- 10 and not more than 14 business days" after it unless a court action
-- lands, and terminate repeat infringers — with "three or more substantiated
-- notices within twelve months" as the stated guidance.
--
-- None of that can be run out of an inbox. Counting substantiated notices per
-- user over a trailing year, and knowing which were withdrawn, defective or
-- answered by an accepted counter-notice (all of which the policy says do NOT
-- count), needs a record. So does the 10-to-14-business-day window, which is
-- a date somebody has to be able to look up.
--
-- Safe harbour under §512 depends on the designated agent being REGISTERED
-- with the Copyright Office, which is Chris's filing, not code. This is the
-- machinery that has to exist for the page to be honest once it is.

CREATE TABLE IF NOT EXISTS dmca_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The user the notice is ABOUT. SET NULL rather than CASCADE: a terminated
  -- or deleted account must not erase the record of why it was terminated.
  subject_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  claimant_name TEXT NOT NULL,
  claimant_email TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL DEFAULT 'notice' CHECK (kind IN ('notice', 'counter_notice')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',           -- logged, not yet acted on
    'material_removed',   -- listing hidden
    'counter_received',   -- the user disputed it; forward to the claimant
    'restored',           -- restored after the 10-14 business day window
    'withdrawn',          -- claimant withdrew it — does NOT count
    'defective'           -- plainly non-compliant — does NOT count
  )),
  notes TEXT,
  acted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE dmca_notices IS
  'Copyright notices and counter-notices (L11). Drives the repeat-infringer count the DMCA policy describes: substantiated notices in the trailing 12 months, excluding withdrawn, defective, and those answered by an accepted counter-notice.';
COMMENT ON COLUMN dmca_notices.status IS
  'withdrawn and defective are the two the policy says do not count toward repeat infringement; counter_received pauses the count while it is resolved.';

CREATE INDEX IF NOT EXISTS dmca_notices_subject_idx
  ON dmca_notices (subject_profile_id, received_at DESC);

DROP TRIGGER IF EXISTS dmca_notices_updated_at ON dmca_notices;
CREATE TRIGGER dmca_notices_updated_at
  BEFORE UPDATE ON dmca_notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Admin-only, end to end. A notice names a claimant's contact details and an
-- accusation against a user; neither party gets to read the file.
ALTER TABLE dmca_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage DMCA notices" ON dmca_notices;
CREATE POLICY "Admins manage DMCA notices" ON dmca_notices
  FOR ALL USING (is_privileged()) WITH CHECK (is_privileged());

REVOKE ALL ON dmca_notices FROM anon, authenticated;

-- A DMCA removal is not the artist's to undo. `hidden` is a status an artist
-- can set and clear themselves, so without this stamp a removed listing could
-- be republished from Studio the same afternoon — which would put the safe
-- harbour at risk over a single click.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS dmca_removed_at TIMESTAMPTZ;

COMMENT ON COLUMN listings.dmca_removed_at IS
  'Set when a listing is removed on a copyright notice (L11). While it is set the artist cannot change the listing''s status or republish it; only the admin restore path clears it.';

CREATE OR REPLACE FUNCTION guard_listings_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    -- The stamp itself is the platform's.
    NEW.dmca_removed_at := OLD.dmca_removed_at;
    -- And while it is set, the artist may not move the listing out of hidden,
    -- nor edit it into something else and republish it.
    IF OLD.dmca_removed_at IS NOT NULL THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'this listing was removed following a copyright notice; write to support@customcanvas.shop';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_listings_update_trg ON listings;
CREATE TRIGGER guard_listings_update_trg
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION guard_listings_update();

-- The repeat-infringer count, as the policy defines it. A function rather
-- than a view so the twelve-month window is measured at call time, and so the
-- exclusions live in exactly one place — an admin page that computed this
-- itself would drift from the document the moment either changed.
CREATE OR REPLACE FUNCTION dmca_substantiated_count(p_profile_id UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int
    FROM dmca_notices
   WHERE subject_profile_id = p_profile_id
     AND kind = 'notice'
     AND received_at > now() - interval '12 months'
     -- The policy: "A notice is ordinarily not counted where the user files a
     -- counter-notice that we accept, where the notice is withdrawn, or where
     -- the notice is plainly defective."
     AND status NOT IN ('withdrawn', 'defective', 'restored');
$$;

COMMENT ON FUNCTION dmca_substantiated_count(UUID) IS
  'Substantiated copyright notices against a user in the trailing 12 months, excluding withdrawn, defective and restored-after-counter-notice. Three or more ordinarily means termination (DMCA policy, "Repeat infringers").';

REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM anon, authenticated;
