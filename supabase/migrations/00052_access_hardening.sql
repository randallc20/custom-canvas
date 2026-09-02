-- 00052_access_hardening.sql
-- Review-fix phase R8 (docs/REVIEW-FIX-PLAN.md): findings 01-P2 x3, 01-P3,
-- the 01 appendix rows on verification_requests and reports, ruling D3,
-- plus the analytics_events INSERT policy the plan lists under R7.
--
-- 1. is_privileged() inferred "service role" from auth.uid() IS NULL, which is
--    equally true for the bare anon key. Every column guard therefore switched
--    itself OFF for the least-trusted caller. Now: privileged when there is no
--    PostgREST request at all (psql maintenance, GoTrue's own writes such as
--    the ON DELETE SET NULL cascades behind auth.admin.deleteUser, pg_cron),
--    when the request's JWT role is service_role, when a trusted SECURITY
--    DEFINER function raised the transaction flag, or when the caller is an
--    admin. A request whose claims role is anon or authenticated is never
--    privileged on its own. guard_gallery_profile_update carried its own copy
--    of the old inference and now asks is_privileged() instead.
-- 2. profiles.email was writable by its owner (UPDATE was a table-level grant
--    and the guard froze role only). One PATCH squatted on another person's
--    address: handle_new_user then hit profiles_email_key and the victim could
--    never register, and every server email keyed on profiles.email went to
--    the chosen address. Two layers: the UPDATE grant is now column-level
--    (full_name, avatar_url, email_preferences — the three the browser
--    writes), so a new column fails closed, and the guard copies OLD email and
--    unsubscribe_token over NEW for non-privileged callers in case the grant
--    is ever widened again.
-- 3. follows: 00002 made the whole follow graph anon-readable to get a public
--    COUNT. Own-row SELECT is restored and the number comes from
--    follower_count(), a SECURITY DEFINER function that returns only the
--    count. Ruling D3: full_name stays anon-readable (artist pages show it);
--    email_preferences leaves the anon grant (only the signed-in account page
--    reads it, as authenticated).
-- 4. analytics_events: the anonymous INSERT policy let any holder of the anon
--    key inflate an artist's view counts from a loop that never touches the
--    rate limiter. Only the service role inserts now (R7 routes TrackView
--    through /api/analytics, which is throttled).
-- 5. website_url on gallery_profiles and artist_profiles is rendered as an
--    href; nothing on any write path checked the scheme. CHECK it at the
--    only chokepoint the direct-API path passes through.
-- 6. verification_requests INSERT pins status = 'pending' (an artist could
--    file a row already marked approved); reports INSERT pins status =
--    'pending' and NULL admin_notes/resolved_by.

-- ============================================================
-- (1) is_privileged: name the trusted contexts instead of inferring them
-- ============================================================
CREATE OR REPLACE FUNCTION is_privileged()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- No PostgREST request behind this statement (psql, GoTrue, cron).
    nullif(current_setting('request.jwt.claims', true), '') IS NULL
    -- The service-role key presented through PostgREST.
    OR COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    -- A trusted SECURITY DEFINER function marked this transaction (00009).
    OR COALESCE(current_setting('app.privileged', true) = 'on', false)
    -- An admin's own session.
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION guard_gallery_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Same trusted set as every other column guard (was: admin OR uid IS NULL,
  -- which is also true for the anon key).
  is_admin := is_privileged();

  IF NOT is_admin THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'verification status can only be changed by an admin';
    END IF;

    IF (NEW.gallery_name IS DISTINCT FROM OLD.gallery_name
        OR NEW.partner_type IS DISTINCT FROM OLD.partner_type) AND OLD.is_verified THEN
      NEW.is_verified := FALSE;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
      UPDATE artist_education SET partner_id = NULL WHERE partner_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- (2) profiles: email and unsubscribe_token are not the owner's to change
-- ============================================================
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
  END IF;
  RETURN NEW;
END;
$$;

-- Privileges are additive (00031): revoke the table-level UPDATE, grant back
-- the columns the browser actually writes. anon gets none — the UPDATE policy
-- is auth.uid() = id, so it never had a legitimate write.
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (full_name, avatar_url, email_preferences) ON profiles TO authenticated;

-- D3: email_preferences is read only by the signed-in account page.
REVOKE SELECT (email_preferences) ON profiles FROM anon;

-- ============================================================
-- (3) follows: own rows only; the public number comes from a function
-- ============================================================
DROP POLICY IF EXISTS "Follow counts visible to all" ON follows;
CREATE POLICY "Users can see own follows" ON follows FOR SELECT
  USING (auth.uid() = follower_id);

CREATE OR REPLACE FUNCTION follower_count(p_artist_id UUID)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM follows WHERE artist_id = p_artist_id;
$$;
REVOKE ALL ON FUNCTION follower_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION follower_count(UUID) TO anon, authenticated, service_role;

-- ============================================================
-- (4) analytics_events: inserts are the service role's alone
-- ============================================================
DROP POLICY IF EXISTS "Insert analytics events" ON analytics_events;

-- ============================================================
-- (5) website_url must be an http(s) URL
-- ============================================================
-- The profile forms saved a cleared field as '' (one artist row on DEV);
-- normalise before the constraint lands. The forms now send NULL.
UPDATE gallery_profiles SET website_url = NULL
  WHERE website_url IS NOT NULL AND website_url !~* '^https?://';
UPDATE artist_profiles SET website_url = NULL
  WHERE website_url IS NOT NULL AND website_url !~* '^https?://';

ALTER TABLE gallery_profiles DROP CONSTRAINT IF EXISTS gallery_profiles_website_url_scheme;
ALTER TABLE gallery_profiles ADD CONSTRAINT gallery_profiles_website_url_scheme
  CHECK (website_url IS NULL OR website_url ~* '^https?://');
ALTER TABLE artist_profiles DROP CONSTRAINT IF EXISTS artist_profiles_website_url_scheme;
ALTER TABLE artist_profiles ADD CONSTRAINT artist_profiles_website_url_scheme
  CHECK (website_url IS NULL OR website_url ~* '^https?://');

-- ============================================================
-- (6) appendix: the requester does not set the review columns
-- ============================================================
DROP POLICY IF EXISTS "Artists create own verification requests" ON verification_requests;
CREATE POLICY "Artists create own verification requests" ON verification_requests FOR INSERT
  WITH CHECK (
    artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS "Users can create reports" ON reports;
CREATE POLICY "Users can create reports" ON reports FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'pending'
    AND admin_notes IS NULL
    AND resolved_by IS NULL
  );
