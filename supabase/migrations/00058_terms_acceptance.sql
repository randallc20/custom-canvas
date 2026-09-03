-- L2 — acceptance and versioning.
--
-- Terms of Service §1 has acceptance happen by "checking an acceptance box",
-- and §17 requires affirmative acceptance again when a change is material.
-- Terms of Sale says "you accept them at checkout". Until now only the Artist
-- Agreement was versioned and recorded (00037), and it records v1.0 — the
-- counsel set that went effective 2026-09-03 is v2.0, which adds an
-- arbitration clause and a class-action waiver. Those are material under §17,
-- so every existing account has to accept again (ruling D11).
--
-- Deliberately NOT backfilled. A backfill here would record an acceptance
-- that never happened, which is the one thing this table exists to avoid.
-- NULL is the correct state for every existing row: it means "has accepted
-- nothing", and it is what makes the re-acceptance interstitial appear.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_of_sale_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_of_sale_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.terms_version IS
  'Terms of Service version this account affirmatively accepted (src/lib/agreement.ts TERMS_VERSION). NULL = never accepted; the interstitial gates purchases, listings, messages and reviews until it is set.';
COMMENT ON COLUMN profiles.terms_of_sale_version IS
  'Terms of Sale version accepted, stamped at first purchase or by the interstitial (TERMS_OF_SALE_VERSION).';

-- An acceptance record must be tamper-proof after the fact. profiles has
-- column-level UPDATE grants (00052) and these four columns are deliberately
-- not in that grant, so a client UPDATE fails at 42501 before the trigger
-- runs. The freeze below is the second lock: it also covers any future
-- table-level grant, and it is what the smoke test asserts behaviourally
-- rather than by reading the grant catalog.
--
-- Writes go through POST /api/account/accept-terms, which resolves the user
-- from their cookie session and then writes with the service role, stamping
-- the version from the server constant — never a version the client sent.
CREATE OR REPLACE FUNCTION guard_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'role can only be changed by an administrator';
    END IF;
    -- The auth record owns the address; the token is minted server-side.
    NEW.email := OLD.email;
    NEW.unsubscribe_token := OLD.unsubscribe_token;
    -- 00058: acceptance is a legal record, written only by the acceptance
    -- route under the service role.
    NEW.terms_version := OLD.terms_version;
    NEW.terms_accepted_at := OLD.terms_accepted_at;
    NEW.terms_of_sale_version := OLD.terms_of_sale_version;
    NEW.terms_of_sale_accepted_at := OLD.terms_of_sale_accepted_at;
  END IF;
  RETURN NEW;
END;
$$;

-- No SELECT grant either: the columns are fail-closed to anon and
-- authenticated, and the client learns what it still owes from
-- GET /api/account/acceptance rather than by reading the row. That keeps the
-- public profile payload unchanged and means the smoke test's grant matrix
-- needs no new SELECT rows — an appearance of one of these columns in that
-- matrix is a leak.
