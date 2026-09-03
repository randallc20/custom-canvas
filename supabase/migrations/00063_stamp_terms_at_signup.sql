-- Fixes an L2 race, found by the e2e suite (lover-social 8.1, intermittently).
--
-- L2 recorded the registration checkbox's acceptance by POSTing
-- /api/account/acceptance from the browser straight after
-- `supabase.auth.signUp`. Two things could then happen in the wrong order:
-- the acceptance query behind the re-acceptance interstitial could read the
-- row BEFORE the stamp landed, cache `blocks: true` for its five-minute
-- staleTime, and open "We've updated our terms" over the face of someone who
-- had just ticked that exact box; or the POST could go out before the session
-- cookie was attached and fail silently (it is deliberately best-effort, so
-- that a stamping failure never fails a registration).
--
-- Both disappear if the acceptance is recorded in the same statement that
-- creates the profile. There is no window to race, no client call to fail,
-- and no version supplied by the client — the honest sequencing, given the
-- registration form will not submit without the checkbox.
--
-- `current_terms_version()` is the version the trigger stamps.
-- src/lib/agreement.test.ts asserts it equals TERMS_VERSION, which is itself
-- pinned to the "Version X.Y" line of terms-of-service.md, so all three move
-- together or the unit run fails.

CREATE OR REPLACE FUNCTION current_terms_version()
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT '2.0'::text;
$$;

COMMENT ON FUNCTION current_terms_version() IS
  'The Terms of Service version handle_new_user stamps on a new account. Must equal TERMS_VERSION in src/lib/agreement.ts — src/lib/agreement.test.ts reads this migration and asserts it.';

-- Every reference here is schema-qualified, and that is load-bearing rather
-- than tidy. This trigger fires as GoTrue (supabase_auth_admin), whose
-- search_path does not include `public` — which is why the original body
-- wrote `public.profiles` rather than `profiles`. An unqualified
-- `current_terms_version()` therefore resolved to nothing and every signup
-- failed with "Database error creating new user". The e2e seeder caught it
-- within the hour; db-smoke §12 had not, because it inserts as a superuser
-- whose search_path DOES include public, so it now clears the search_path
-- first to reproduce GoTrue's conditions.
--
-- ⚠️ READ 00023 BEFORE TOUCHING THIS FUNCTION. The first cut of this
-- migration rebuilt the body from 00001's and silently reverted 00023's role
-- sanitiser, which meant anyone could self-register as `admin` again by
-- passing `options.data.role` to supabase.auth.signUp — and an admin row
-- makes is_privileged() true, so every column freeze in the schema falls
-- open. Found by the r3 auth review pass. `CREATE OR REPLACE` takes the body
-- it is given: rebuild from the LATEST body, never from the oldest one.
--
-- The three things this function must do, all of which have cost something to
-- learn:
--   1. sanitise the client-supplied role (00023)
--   2. schema-qualify everything (this migration)
--   3. stamp the Terms of Service acceptance the registration checkbox covers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  requested TEXT := NEW.raw_user_meta_data->>'role';
  safe_role TEXT;
BEGIN
  -- 00023: only self-selectable roles. Admins are granted manually with the
  -- service role; anything else falls back to 'user'.
  safe_role := CASE WHEN requested IN ('artist', 'gallery') THEN requested ELSE 'user' END;

  INSERT INTO public.profiles (
    id, email, role, full_name, accepted_terms_at, terms_version, terms_accepted_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    safe_role,
    NEW.raw_user_meta_data->>'full_name',
    now(),
    -- The registration form requires "I am 18 or older and agree to the
    -- Terms of Service and Privacy Policy" before it will submit (D12), so
    -- an account existing IS that acceptance. Deliberately NOT the Terms of
    -- Sale: those are accepted at checkout (Terms of Sale §1), and stamping
    -- them here would record an acceptance nobody was shown.
    public.current_terms_version(),
    now()
  );
  RETURN NEW;
END;
$$;
