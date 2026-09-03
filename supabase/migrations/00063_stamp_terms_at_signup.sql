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
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name, terms_version, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name',
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
