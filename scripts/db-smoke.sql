-- Database-layer smoke test (P2 of docs/HARDENING-AND-POLISH-PLAN.md).
-- Run via scripts/db-smoke.sh (plain psql, ON_ERROR_STOP). Three guards:
--
--   1. RPC smoke   — every callable public function is executed once with
--                    throwaway args in a rolled-back transaction, so
--                    "function does not parse" (link_education_partners was
--                    invalid SQL from migration 00008 until 00043) fails HERE,
--                    not in a browser.
--   2. Policy matrix — the exact set of (table, verb, policy) rows is pinned;
--                    a dropped or never-written policy (reports had no UPDATE
--                    policy, gallery_profiles no DELETE) is a diff, not a
--                    production mystery.
--   3. Grant matrix — the column grants on the column-restricted tables must
--                    cover what src/lib/publicProfile.ts selects (the
--                    roster-search bug was drift between these two).
--
-- Schema changed on purpose? Update the expectations here in the SAME
-- migration/PR — this file is the checked-in answer key, not a cache.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. RPC smoke: call each non-trigger public function, then roll back.
--    Trigger functions can't be SELECTed; they are pinned by guard 1b below
--    so a new function can't silently join the schema untested.
-- ---------------------------------------------------------------------------
BEGIN;
SELECT is_privileged();
SELECT blocked_by('00000000-0000-0000-0000-000000000001'::uuid);
SELECT sender_is_blocked('00000000-0000-0000-0000-000000000001'::uuid);
SELECT link_education_partners('00000000-0000-0000-0000-000000000001'::uuid);
SELECT refresh_completeness_score('00000000-0000-0000-0000-000000000001'::uuid);
ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1b. Function enumeration: every public function must be listed either in
--     the SELECT block above (callable) or here as a trigger function.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_functions(name text) ON COMMIT DROP;
INSERT INTO expected_functions VALUES
  -- callable (smoked above)
  ('is_privileged'), ('blocked_by'), ('sender_is_blocked'),
  ('link_education_partners'), ('refresh_completeness_score'),
  -- trigger functions (exercised via their tables' writes)
  ('artist_search_update'), ('enforce_featured_cap'), ('enforce_partner_picks_cap'),
  ('guard_artist_profiles_insert'), ('guard_artist_profiles_update'),
  ('guard_conversations_update'), ('guard_gallery_profile_update'),
  ('guard_listing_alert_stamps'), ('guard_messages_update'),
  ('guard_orders_update'), ('guard_profiles_update'), ('handle_new_user'),
  ('listing_tags_touch_listing'), ('listings_search_update'),
  ('notify_admins_new_application'), ('notify_artist_new_follower'),
  ('notify_followers_new_listing'),
  ('notify_savers_price_drop'), ('set_order_delivered_at'),
  ('set_review_artist'), ('update_updated_at');

DO $$
DECLARE diff text;
BEGIN
  SELECT string_agg(marker || ' ' || name, E'\n' ORDER BY marker, name) INTO diff FROM (
    SELECT 'UNLISTED (add a smoke call or trigger entry):' AS marker, p.proname AS name
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname NOT IN (SELECT name FROM expected_functions)
    UNION ALL
    SELECT 'MISSING (listed but gone from the schema):', e.name
      FROM expected_functions e
      WHERE e.name NOT IN (
        SELECT p.proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
  ) d;
  IF diff IS NOT NULL THEN
    RAISE EXCEPTION E'public function drift:\n%', diff;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Policy matrix: the exact (table, verb, policy-name) set.
--    Verbs: r=SELECT a=INSERT w=UPDATE d=DELETE *=ALL
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_policies(tbl text, cmd text, pol text) ON COMMIT DROP;
INSERT INTO expected_policies VALUES
  ('analytics_events','a','Insert analytics events'),
  ('analytics_events','r','Artists can see own analytics'),
  ('analytics_events','r','Viewers can read their own events'),
  ('artist_education','a','Artists can manage own education'),
  ('artist_education','d','Artists can delete own education'),
  ('artist_education','r','Artist education follows artist visibility'),
  ('artist_education','w','Artists can update own education'),
  ('artist_personal_photos','a','Artists can manage own photos'),
  ('artist_personal_photos','d','Artists can delete own photos'),
  ('artist_personal_photos','r','Personal photos follow artist visibility'),
  ('artist_personal_photos','w','Artists can update own photos'),
  ('artist_profiles','a','Artists can insert own profile'),
  ('artist_profiles','r','Live artist profiles visible to all'),
  ('artist_profiles','w','Artists can update own profile'),
  ('artist_services','r','Active services visible to signed-in users'),
  ('artist_videos','a','Artists can manage own videos'),
  ('artist_videos','d','Artists can delete own videos'),
  ('artist_videos','r','Artist videos follow artist visibility'),
  ('artist_videos','w','Artists can update own videos'),
  ('blocked_users','*','Users manage own blocks'),
  ('commission_updates','a','Artist posts commission updates'),
  ('commission_updates','r','Commission parties view updates'),
  ('commissions','a','Users can create commissions'),
  ('commissions','r','Commission participants can view'),
  ('conversations','a','Authenticated users can create conversations'),
  ('conversations','r','Participants can see own conversations'),
  ('conversations','w','Participants can update conversations'),
  ('featured_listings','a','Admins add featured listings'),
  ('featured_listings','d','Admins remove featured listings'),
  ('featured_listings','r','Featured shelf is public'),
  ('featured_listings','w','Admins reorder featured listings'),
  ('follows','a','Users can follow'),
  ('follows','d','Users can unfollow'),
  ('follows','r','Follow counts visible to all'),
  ('gallery_artists','a','Gallery owners can manage their artists'),
  ('gallery_artists','d','Gallery owners can remove artists'),
  ('gallery_artists','r','Gallery artists are publicly visible'),
  ('gallery_profiles','a','Galleries can insert own profile'),
  ('gallery_profiles','r','Gallery profiles visible to all'),
  ('gallery_profiles','w','Galleries can update own profile'),
  ('listing_images','*','Artists can manage own listing images'),
  ('listing_images','r','Listing images follow listing visibility'),
  ('listing_series','a','Artists can manage own series'),
  ('listing_series','d','Artists can delete own series'),
  ('listing_series','r','Series follow artist visibility'),
  ('listing_series','w','Artists can update own series'),
  ('listing_tags','*','Artists can manage own listing tags'),
  ('listing_tags','r','Listing tags follow listing visibility'),
  ('listings','a','Artists can insert own listings'),
  ('listings','d','Artists can delete own listings'),
  ('listings','r','Admins can see all listings'),
  ('listings','r','Listings visible if artist live and not hidden or draft'),
  ('listings','w','Artists can update own listings'),
  ('message_attachments','a','Senders can add attachments'),
  ('message_attachments','r','Attachments visible to conversation participants'),
  ('messages','a','Participants can send messages'),
  ('messages','r','Participants can see messages'),
  ('messages','w','Recipients can mark as read'),
  ('muted_conversations','*','Users manage own mutes'),
  ('notifications','r','Users can see own notifications'),
  ('notifications','w','Users can update own notifications'),
  ('orders','r','Admins can see all orders'),
  ('orders','r','Artists can see their orders'),
  ('orders','r','Buyers can see own orders'),
  ('orders','w','Artists can update own orders'),
  ('partner_picks','a','Verified partners add picks'),
  ('partner_picks','d','Verified partners remove picks'),
  ('partner_picks','r','Partner picks are public'),
  ('partner_picks','w','Verified partners update picks'),
  ('profiles','r','Profiles visible to all'),
  ('profiles','w','Users can update own profile'),
  ('reports','a','Users can create reports'),
  ('reports','r','Admins can see all reports'),
  ('reports','r','Users can see own reports'),
  ('reports','w','Admins can update reports'),
  ('reviews','a','Buyers can review delivered orders'),
  ('reviews','r','Reviews visible to all'),
  ('saved_listings','a','Users can save'),
  ('saved_listings','d','Users can unsave'),
  ('saved_listings','r','Users can see own saves'),
  ('tags','r','Tags visible to all'),
  ('verification_requests','a','Artists create own verification requests'),
  ('verification_requests','r','Admins can see all verification requests'),
  ('verification_requests','r','Artists view own verification requests');

DO $$
DECLARE diff text;
BEGIN
  SELECT string_agg(marker || ' ' || row, E'\n' ORDER BY marker, row) INTO diff FROM (
    SELECT 'UNEXPECTED policy:' AS marker,
           c.relname || ' | ' || p.polcmd::text || ' | ' || p.polname AS row
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND (c.relname, p.polcmd::text, p.polname) NOT IN
            (SELECT tbl, cmd, pol FROM expected_policies)
    UNION ALL
    SELECT 'MISSING policy (dropped or renamed):',
           e.tbl || ' | ' || e.cmd || ' | ' || e.pol
      FROM expected_policies e
      WHERE (e.tbl, e.cmd, e.pol) NOT IN (
        SELECT c.relname, p.polcmd::text, p.polname
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public')
  ) d;
  IF diff IS NOT NULL THEN
    RAISE EXCEPTION E'RLS policy drift:\n%', diff;
  END IF;
END $$;

-- Every public table with policies must also have RLS enabled (a policy on
-- a table with RLS off enforces nothing), and vice versa for known tables.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.oid IN (SELECT polrelid FROM pg_policy)
      AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tables with policies but RLS DISABLED: %', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Grant matrix for the column-restricted tables (00031 profiles,
--    00033 artist_profiles). Two directions:
--    (a) the exact granted column set is pinned (privacy drift is a diff);
--    (b) service-role-only columns must NOT be granted.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_grants(tbl text, col text) ON COMMIT DROP;
INSERT INTO expected_grants
  SELECT 'profiles', unnest(ARRAY[
    'id','full_name','avatar_url','role','created_at','updated_at',
    'email_preferences'])
  UNION ALL
  SELECT 'artist_profiles', unnest(ARRAY[
    'id','profile_id','slug','display_name','bio','artist_statement',
    'influences','school','graduation_year','status','neighborhood','city',
    'website_url','fulfillment_pref','commissions_open','commission_desc',
    'commission_min_cents','commission_turnaround','accent_color',
    'banner_image_url','bio_layout','is_houston_verified','is_featured',
    'completeness_score','is_live','stripe_onboarded','created_at',
    'updated_at','pinned_listing_ids','story','primary_mediums','away_mode',
    'away_message','away_until','commissions_open_before_away',
    'last_listing_alert_at','application_status',
    -- granted but not in ARTIST_PUBLIC_COLS (harmless payload):
    'agreement_accepted_at','agreement_version','search_vector']);

DO $$
DECLARE diff text; role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    SELECT string_agg(marker || ' ' || row, E'\n' ORDER BY marker, row) INTO diff FROM (
      SELECT 'UNEXPECTED grant (leak?):' AS marker,
             table_name || '.' || column_name || ' -> ' || role_name AS row
        FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND grantee = role_name
          AND table_name IN ('profiles','artist_profiles')
          AND privilege_type = 'SELECT'
          AND (table_name, column_name) NOT IN (SELECT tbl, col FROM expected_grants)
      UNION ALL
      SELECT 'MISSING grant (selects will 42501):',
             e.tbl || '.' || e.col || ' -> ' || role_name
        FROM expected_grants e
        WHERE (e.tbl, e.col) NOT IN (
          SELECT table_name, column_name
            FROM information_schema.column_privileges
            WHERE table_schema = 'public' AND grantee = role_name
              AND table_name IN ('profiles','artist_profiles')
              AND privilege_type = 'SELECT')
    ) d;
    IF diff IS NOT NULL THEN
      RAISE EXCEPTION E'column-grant drift for role %:\n%', role_name, diff;
    END IF;
  END LOOP;
END $$;

-- The columns 00031/00033 made service-role-only must stay that way.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name || ' -> ' || grantee, E'\n') INTO bad
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND grantee IN ('anon','authenticated')
      AND privilege_type = 'SELECT'
      AND ((table_name = 'profiles' AND column_name IN ('email','unsubscribe_token'))
        OR (table_name = 'artist_profiles' AND column_name IN
            ('rejection_reason','reviewed_by','reviewed_at','stripe_account_id')));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'PRIVATE column granted to a client role:\n%', bad;
  END IF;
END $$;

ROLLBACK;

\echo 'db-smoke: all checks passed'
