-- Artist Agreement acceptance (decision 2026-08-24): the 85/15 split is
-- artist-facing only, and artists formally accept the Artist Agreement
-- (click-wrap) when creating their account. Acceptance is versioned and
-- timestamped so future agreement revisions can force re-acceptance.

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_version TEXT;

-- The acceptance record must be tamper-proof after the fact: an artist sets
-- it once at INSERT (their own act of acceptance); any later change goes
-- through privileged server routes (re-acceptance flows). Extend the update
-- guard to freeze both columns for non-privileged writers.
CREATE OR REPLACE FUNCTION guard_artist_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_houston_verified := OLD.is_houston_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.completeness_score := OLD.completeness_score;
    NEW.stripe_onboarded := OLD.stripe_onboarded;
    NEW.stripe_account_id := OLD.stripe_account_id;
    NEW.is_live := OLD.is_live;
    NEW.application_status := OLD.application_status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.agreement_accepted_at := OLD.agreement_accepted_at;
    NEW.agreement_version := OLD.agreement_version;
  END IF;
  RETURN NEW;
END;
$$;

-- Column privacy: 00033's dynamic grant predates these columns, so they are
-- currently unreadable by clients (fail-closed default). The artist's own
-- onboarding UI doesn't need to read them back, but grant SELECT so admin
-- tooling and any future self-service surfaces don't 42501; they're not
-- sensitive (a timestamp and a version string).
GRANT SELECT (agreement_accepted_at, agreement_version)
  ON artist_profiles TO anon, authenticated;

-- Backfill: existing artists (seed/demo/test accounts — there are no real
-- artists yet on any environment) are recorded as accepting v1.0 now, so the
-- submit gate doesn't strand them. Real future artists accept at onboarding.
UPDATE artist_profiles
   SET agreement_accepted_at = now(), agreement_version = '1.0'
 WHERE agreement_accepted_at IS NULL;
