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
-- R7 read RPCs (00051). Run as postgres auth.uid() is NULL, so the two
-- caller-scoped ones return no rows — this proves they parse and execute.
SELECT * FROM neighborhood_listing_counts('Houston');
SELECT * FROM neighborhood_listing_counts(NULL);
SELECT * FROM my_unread_counts();
SELECT * FROM artist_sales_totals('00000000-0000-0000-0000-000000000001'::uuid);
SELECT follower_count('00000000-0000-0000-0000-000000000001'::uuid);
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
  ('neighborhood_listing_counts'), ('my_unread_counts'), ('artist_sales_totals'),
  ('follower_count'),
  -- trigger functions (exercised via their tables' writes)
  ('artist_search_update'), ('enforce_featured_cap'), ('enforce_partner_picks_cap'),
  ('guard_artist_profiles_insert'), ('guard_artist_profiles_update'),
  ('guard_commissions_insert'), ('guard_conversations_update'),
  ('guard_gallery_profile_update'), ('guard_listing_alert_stamps'),
  ('guard_message_attachments_insert'), ('guard_message_attachments_update'),
  ('guard_messages_insert'), ('guard_messages_update'),
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
  ('follows','r','Users can see own follows'),
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
--    Per role since 00052 (D3): email_preferences is authenticated-only.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_grants(tbl text, col text, roles text[]) ON COMMIT DROP;
INSERT INTO expected_grants
  SELECT 'profiles', unnest(ARRAY[
    'id','full_name','avatar_url','role','created_at','updated_at']),
    ARRAY['anon','authenticated']
  UNION ALL
  SELECT 'profiles', 'email_preferences', ARRAY['authenticated']
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
    'agreement_accepted_at','agreement_version','search_vector']),
    ARRAY['anon','authenticated'];

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
          AND (table_name, column_name) NOT IN
              (SELECT tbl, col FROM expected_grants WHERE role_name = ANY(roles))
      UNION ALL
      SELECT 'MISSING grant (selects will 42501):',
             e.tbl || '.' || e.col || ' -> ' || role_name
        FROM expected_grants e
        WHERE role_name = ANY(e.roles)
          AND (e.tbl, e.col) NOT IN (
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

-- UPDATE grants (00052, 01-P2). profiles is column-level: authenticated may
-- write exactly the three columns the browser edits, anon none — a column
-- added to profiles is not client-writable until it is granted here AND in
-- a migration. artist_profiles keeps its table-level UPDATE (the 00009/00037
-- guard freezes the platform-owned columns), so every column shows up here:
-- a new artist_profiles column is a diff to acknowledge, not a silent grant.
CREATE TEMP TABLE expected_update_grants(tbl text, col text, roles text[]) ON COMMIT DROP;
INSERT INTO expected_update_grants
  SELECT 'profiles', unnest(ARRAY['full_name','avatar_url','email_preferences']),
    ARRAY['authenticated']
  UNION ALL
  SELECT 'artist_profiles', unnest(ARRAY[
    'id','profile_id','slug','display_name','bio','artist_statement',
    'influences','school','graduation_year','status','neighborhood','city',
    'website_url','fulfillment_pref','commissions_open','commission_desc',
    'commission_min_cents','commission_turnaround','accent_color',
    'banner_image_url','bio_layout','is_houston_verified','is_featured',
    'completeness_score','is_live','stripe_onboarded','stripe_account_id',
    'created_at','updated_at','pinned_listing_ids','story','primary_mediums',
    'away_mode','away_message','away_until','commissions_open_before_away',
    'last_listing_alert_at','application_status','rejection_reason',
    'reviewed_by','reviewed_at','agreement_accepted_at','agreement_version',
    'search_vector',
    -- 00056: table-level grant, frozen by guard_artist_profiles_update.
    'stripe_account_updated_at']),
    ARRAY['anon','authenticated'];

DO $$
DECLARE diff text; role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    SELECT string_agg(marker || ' ' || row, E'\n' ORDER BY marker, row) INTO diff FROM (
      SELECT 'UNEXPECTED UPDATE grant (client-writable column?):' AS marker,
             table_name || '.' || column_name || ' -> ' || role_name AS row
        FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND grantee = role_name
          AND table_name IN ('profiles','artist_profiles')
          AND privilege_type = 'UPDATE'
          AND (table_name, column_name) NOT IN
              (SELECT tbl, col FROM expected_update_grants WHERE role_name = ANY(roles))
      UNION ALL
      SELECT 'MISSING UPDATE grant (client writes will 42501):',
             e.tbl || '.' || e.col || ' -> ' || role_name
        FROM expected_update_grants e
        WHERE role_name = ANY(e.roles)
          AND (e.tbl, e.col) NOT IN (
          SELECT table_name, column_name
            FROM information_schema.column_privileges
            WHERE table_schema = 'public' AND grantee = role_name
              AND table_name IN ('profiles','artist_profiles')
              AND privilege_type = 'UPDATE')
    ) d;
    IF diff IS NOT NULL THEN
      RAISE EXCEPTION E'UPDATE-grant drift for role %:\n%', role_name, diff;
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
      AND ((table_name = 'profiles' AND column_name IN ('email','unsubscribe_token',
            -- 00058 (L2): acceptance is read back through
            -- GET /api/account/acceptance, never off the row.
            'terms_version','terms_accepted_at',
            'terms_of_sale_version','terms_of_sale_accepted_at'))
        OR (table_name = 'artist_profiles' AND column_name IN
            ('rejection_reason','reviewed_by','reviewed_at','stripe_account_id',
             'stripe_account_updated_at')));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'PRIVATE column granted to a client role:\n%', bad;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. FK delete-action matrix for the money rows (00049, R1 / 01-P0). The
--    party columns must DETACH (SET NULL, 'n') when a person leaves, never
--    take the order with them (CASCADE, 'c'); the two references an artist's
--    cascade would otherwise leave dangling must detach too. Each is also
--    pinned nullable — a re-added NOT NULL would turn SET NULL into a
--    delete-time error. Action codes: a=NO ACTION c=CASCADE n=SET NULL.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_fk_actions(tbl text, con text, col text, action char) ON COMMIT DROP;
INSERT INTO expected_fk_actions VALUES
  ('orders',      'orders_buyer_id_fkey',          'buyer_id',      'n'),
  ('orders',      'orders_artist_id_fkey',         'artist_id',     'n'),
  ('orders',      'orders_listing_id_fkey',        'listing_id',    'n'),
  ('orders',      'orders_commission_id_fkey',     'commission_id', 'n'),
  ('reviews',     'reviews_reviewer_id_fkey',      'reviewer_id',   'n'),
  ('commissions', 'commissions_requester_id_fkey', 'requester_id',  'n');

DO $$
DECLARE diff text;
BEGIN
  SELECT string_agg(marker || ' ' || row, E'\n' ORDER BY marker, row) INTO diff FROM (
    SELECT 'WRONG delete action (want ' || e.action || '):' AS marker,
           e.tbl || '.' || e.con || ' = ' || coalesce(c.confdeltype::text, 'MISSING') AS row
      FROM expected_fk_actions e
      LEFT JOIN pg_constraint c
        ON c.conname = e.con AND c.contype = 'f'
       AND c.conrelid = ('public.' || e.tbl)::regclass
      WHERE c.confdeltype IS DISTINCT FROM e.action
    UNION ALL
    SELECT 'NOT NULL on a SET NULL column:', e.tbl || '.' || e.col
      FROM expected_fk_actions e
      JOIN pg_attribute a
        ON a.attrelid = ('public.' || e.tbl)::regclass AND a.attname = e.col
      WHERE a.attnotnull
  ) d;
  IF diff IS NOT NULL THEN
    RAISE EXCEPTION E'money-row FK drift:\n%', diff;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Physical layer (00051, R7 / 02-P2). The hot-path indexes must exist —
--    a dropped index is a silent slowdown, not an error — and the two
--    caller-scoped RPCs must not be callable by anon (Supabase's default
--    privileges would otherwise hand them out).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE expected_indexes(tbl text, idx text) ON COMMIT DROP;
INSERT INTO expected_indexes VALUES
  ('listing_images',   'listing_images_listing_idx'),
  ('listings',         'listings_status_created_idx'),
  ('listings',         'listings_artist_created_idx'),
  ('orders',           'orders_buyer_created_idx'),
  ('orders',           'orders_artist_created_idx'),
  ('conversations',    'conversations_participant_one_idx'),
  ('conversations',    'conversations_participant_two_idx'),
  ('commissions',      'commissions_conversation_idx'),
  ('commissions',      'commissions_artist_idx'),
  ('commissions',      'commissions_requester_idx'),
  ('follows',          'follows_artist_idx'),
  ('saved_listings',   'saved_listings_listing_idx'),
  ('messages',         'messages_unread_idx'),
  ('analytics_events', 'analytics_events_viewer_listing_idx'),
  -- 00010, redefined by 00055: the oversell guard, one live order per listing.
  ('orders',           'orders_one_live_per_listing');

DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(e.tbl || '.' || e.idx, E'\n' ORDER BY e.tbl, e.idx) INTO missing
    FROM expected_indexes e
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.tablename = e.tbl AND i.indexname = e.idx);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION E'MISSING index (00051/00055):\n%', missing;
  END IF;
END $$;

-- 00055: a disputed order holds the listing slot. The guard is a partial
-- UNIQUE index whose predicate must name all four live statuses — dropping
-- 'disputed' again would silently let a frozen piece be resold.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_indexdef(c.oid) INTO def
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'orders_one_live_per_listing';
  IF def IS NULL OR def NOT ILIKE 'CREATE UNIQUE INDEX%' THEN
    RAISE EXCEPTION 'orders_one_live_per_listing must be a UNIQUE index (00010/00055): %', coalesce(def, 'missing');
  END IF;
  IF def NOT LIKE '%''paid''%' OR def NOT LIKE '%''shipped''%'
     OR def NOT LIKE '%''delivered''%' OR def NOT LIKE '%''disputed''%' THEN
    RAISE EXCEPTION 'orders_one_live_per_listing predicate must cover paid/shipped/delivered/disputed (00055): %', def;
  END IF;
END $$;

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(fn, ', ') INTO bad FROM (
    SELECT 'my_unread_counts()' AS fn WHERE has_function_privilege('anon', 'my_unread_counts()', 'EXECUTE')
    UNION ALL
    SELECT 'artist_sales_totals(uuid)' WHERE has_function_privilege('anon', 'artist_sales_totals(uuid)', 'EXECUTE')
  ) f;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'caller-scoped RPC executable by anon: %', bad;
  END IF;
  IF NOT has_function_privilege('anon', 'neighborhood_listing_counts(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'my_unread_counts()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'artist_sales_totals(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'R7 RPC grant missing (anon spotlight / authenticated unread+totals)';
  END IF;
END $$;

ROLLBACK;

-- ---------------------------------------------------------------------------
-- 6. Order transition matrix (00050, 00057). guard_orders_update must check
--    the TRANSITION, not the target state: an artist may only move paid ->
--    shipped, every platform-owned stamp is frozen for them, and the
--    evidence columns (shipping_address always; tracking/carrier once
--    delivered/disputed/refunded) cannot be rewritten after the fact. The artist is
--    simulated by setting request.jwt.claims — that is all auth.uid() reads,
--    so is_privileged() is false and the guard's non-privileged branch runs.
--    The privileged path (service role: no claims) is exercised too, because
--    /api/orders/[id]/mark-delivered depends on the 00022 delivered_at stamp
--    still firing for it. Fixture rows come from the live schema (an order
--    needs a real buyer and artist); everything rolls back.
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  artist_row record;
  buyer uuid;
  o uuid;
  denied boolean;
  first_shipped timestamptz;
  first_delivered timestamptz;
  row_after orders%ROWTYPE;
BEGIN
  SELECT ap.id, ap.profile_id INTO artist_row
    FROM artist_profiles ap JOIN profiles p ON p.id = ap.profile_id
    WHERE p.role <> 'admin' LIMIT 1;
  IF artist_row IS NULL THEN
    RAISE EXCEPTION 'transition matrix: no non-admin artist_profiles row to build the fixture from';
  END IF;
  SELECT id INTO buyer FROM profiles WHERE id <> artist_row.profile_id LIMIT 1;
  IF buyer IS NULL THEN
    RAISE EXCEPTION 'transition matrix: no second profiles row to act as the buyer';
  END IF;

  INSERT INTO orders (buyer_id, artist_id, amount_cents, platform_fee_cents, artist_payout_cents,
                      buyer_fee_cents, shipping_cents, status, stripe_payment_intent_id, shipping_address)
  VALUES (buyer, artist_row.id, 10000, 1500, 8500, 330, 0, 'paid', 'pi_smoke_' || gen_random_uuid(),
          '{"street":"1 Smoke St","city":"Houston","state":"TX","zip":"77002","country":"US"}'::jsonb)
  RETURNING id INTO o;

  -- Become the artist (non-privileged).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', artist_row.profile_id, 'role', 'authenticated')::text, true);
  IF is_privileged() THEN
    RAISE EXCEPTION 'transition matrix: fixture artist evaluates as privileged';
  END IF;

  -- paid -> shipped: allowed, shipped_at stamped.
  UPDATE orders SET status = 'shipped', tracking_number = 'SMOKE', carrier = 'usps' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.status <> 'shipped' OR row_after.shipped_at IS NULL THEN
    RAISE EXCEPTION 'transition matrix: paid -> shipped should be allowed and stamp shipped_at';
  END IF;
  first_shipped := row_after.shipped_at;
  IF row_after.tracking_number IS DISTINCT FROM 'SMOKE' OR row_after.carrier IS DISTINCT FROM 'usps' THEN
    RAISE EXCEPTION 'transition matrix: tracking/carrier must be accepted on paid -> shipped (the Ship Order modal)';
  END IF;

  -- A typo fix on a SHIPPED order is still the artist's to make (00057
  -- freezes tracking/carrier only from delivered/disputed/refunded).
  UPDATE orders SET tracking_number = 'SMOKE-FIXED', carrier = 'ups' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.tracking_number IS DISTINCT FROM 'SMOKE-FIXED' OR row_after.carrier IS DISTINCT FROM 'ups' THEN
    RAISE EXCEPTION 'transition matrix: tracking/carrier must stay editable on a shipped order';
  END IF;

  -- Frozen stamps: the write is silently discarded, never applied.
  UPDATE orders SET delivered_at = now(), pre_dispute_status = 'paid', shipped_email_sent_at = now(),
                    shipped_at = now() - interval '30 days', review_requested_at = now(),
                    dispute_status = 'needs_response',
                    -- 00060 (D7/L12): seller-protection requirement 4 is the
                    -- platform's to record, and the concession stamp is
                    -- written by a route, not set directly.
                    signature_confirmed = true, signature_confirmed_at = now(),
                    dispute_conceded_at = now(),
                    shipping_address = '{"street":"666 Forged Ave","city":"Nowhere","state":"TX","zip":"00000","country":"US"}'::jsonb
    WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: delivered_at must be frozen for the artist';
  END IF;
  IF row_after.review_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: review_requested_at must be frozen for the artist (00056)';
  END IF;
  -- 00057: the ship-to address is Stripe's and the platform's, never the
  -- artist's; dispute_status is the webhook's record of what dispute_id means.
  IF row_after.shipping_address->>'street' IS DISTINCT FROM '1 Smoke St' THEN
    RAISE EXCEPTION 'transition matrix: shipping_address must be frozen for the artist (00057)';
  END IF;
  IF row_after.dispute_status IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: dispute_status must be frozen for the artist (00057)';
  END IF;
  IF row_after.pre_dispute_status IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: pre_dispute_status must be frozen for the artist';
  END IF;
  IF row_after.shipped_email_sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: shipped_email_sent_at must be frozen for the artist';
  END IF;
  IF row_after.shipped_at IS DISTINCT FROM first_shipped THEN
    RAISE EXCEPTION 'transition matrix: shipped_at must not be client-writable';
  END IF;
  -- 00060 (D7): an artist who could stamp these would be granting themselves
  -- protection requirement 4 and forging who checked the carrier.
  IF row_after.signature_confirmed THEN
    RAISE EXCEPTION 'transition matrix: signature_confirmed must be frozen for the artist (00060)';
  END IF;
  IF row_after.signature_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: signature_confirmed_at must be frozen for the artist (00060)';
  END IF;
  IF row_after.dispute_conceded_at IS NOT NULL THEN
    RAISE EXCEPTION 'transition matrix: dispute_conceded_at must be frozen for the artist (00060)';
  END IF;

  -- shipped -> delivered: denied (delivered is server-side only now).
  denied := false;
  BEGIN
    UPDATE orders SET status = 'delivered' WHERE id = o;
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'transition matrix: shipped -> delivered was ALLOWED for the artist';
  END IF;

  -- Privileged: freeze the order as disputed, remembering the prior state.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE orders SET status = 'disputed', pre_dispute_status = 'shipped', dispute_id = 'dp_smoke' WHERE id = o;

  -- disputed -> shipped: denied.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', artist_row.profile_id, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    UPDATE orders SET status = 'shipped' WHERE id = o;
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'transition matrix: disputed -> shipped was ALLOWED for the artist';
  END IF;

  -- Evidence freeze (00057): once disputed, tracking and carrier are what
  -- the platform submits to the bank — the artist's write is discarded.
  UPDATE orders SET tracking_number = 'FORGED', carrier = 'fedex' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.tracking_number IS DISTINCT FROM 'SMOKE-FIXED' OR row_after.carrier IS DISTINCT FROM 'ups' THEN
    RAISE EXCEPTION 'transition matrix: tracking/carrier must be frozen on a disputed order (00057)';
  END IF;

  -- Privileged: settle as refunded.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE orders SET status = 'refunded', pre_dispute_status = NULL WHERE id = o;

  -- refunded -> delivered: denied (this is the one-live-order re-occupation hole).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', artist_row.profile_id, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    UPDATE orders SET status = 'delivered' WHERE id = o;
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'transition matrix: refunded -> delivered was ALLOWED for the artist';
  END IF;
  UPDATE orders SET tracking_number = 'FORGED', carrier = 'fedex' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.tracking_number IS DISTINCT FROM 'SMOKE-FIXED' OR row_after.carrier IS DISTINCT FROM 'ups' THEN
    RAISE EXCEPTION 'transition matrix: tracking/carrier must be frozen on a refunded order (00057)';
  END IF;

  -- Privileged restore to paid (a won dispute), then the artist ships again:
  -- allowed, and the ORIGINAL shipped_at survives (stamp only when NULL).
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE orders SET status = 'paid' WHERE id = o;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', artist_row.profile_id, 'role', 'authenticated')::text, true);
  UPDATE orders SET status = 'shipped' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.status <> 'shipped' OR row_after.shipped_at IS DISTINCT FROM first_shipped THEN
    RAISE EXCEPTION 'transition matrix: re-shipping must keep the original shipped_at';
  END IF;

  -- Privileged shipped -> delivered (the mark-delivered route's write): the
  -- 00022 trigger must still stamp delivered_at under the service role.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE orders SET status = 'delivered' WHERE id = o AND status = 'shipped';
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.status <> 'delivered' OR row_after.delivered_at IS NULL THEN
    RAISE EXCEPTION 'transition matrix: privileged shipped -> delivered must stamp delivered_at';
  END IF;
  first_delivered := row_after.delivered_at;

  -- Delivered: tracking/carrier are evidence now, frozen for the artist (00057).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', artist_row.profile_id, 'role', 'authenticated')::text, true);
  UPDATE orders SET tracking_number = 'FORGED', carrier = 'fedex' WHERE id = o;
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.tracking_number IS DISTINCT FROM 'SMOKE-FIXED' OR row_after.carrier IS DISTINCT FROM 'ups' THEN
    RAISE EXCEPTION 'transition matrix: tracking/carrier must be frozen on a delivered order (00057)';
  END IF;

  -- A chargeback on the delivered order, later won: the privileged restore
  -- (disputed -> delivered) must keep the ORIGINAL delivered_at (00057 null
  -- guard on the 00022 trigger) — that date is requirement-3 evidence.
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE orders SET status = 'disputed', pre_dispute_status = 'delivered', dispute_id = 'dp_smoke_2',
                    dispute_status = 'needs_response'
    WHERE id = o;
  UPDATE orders SET delivered_at = first_delivered - interval '60 days' WHERE id = o; -- age the stamp so a re-stamp is visible
  first_delivered := first_delivered - interval '60 days';
  UPDATE orders SET status = 'delivered', pre_dispute_status = NULL, dispute_outcome = 'won',
                    dispute_status = 'won'
    WHERE id = o AND status = 'disputed';
  SELECT * INTO row_after FROM orders WHERE id = o;
  IF row_after.status <> 'delivered' OR row_after.delivered_at IS DISTINCT FROM first_delivered THEN
    RAISE EXCEPTION 'transition matrix: a won restore to delivered must keep the original delivered_at (00057): % vs %',
      row_after.delivered_at, first_delivered;
  END IF;
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 6. Access matrix (00052, R8). Everything below runs under SET ROLE with
--    request.jwt.claims set the way PostgREST would, so RLS and column grants
--    are exercised as the anon/authenticated roles see them — not as the
--    table owner. Each sub-block rolls back.
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  non_admin uuid;
  admin_id uuid;
BEGIN
  SELECT id INTO non_admin FROM profiles WHERE role <> 'admin' LIMIT 1;
  SELECT id INTO admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  IF non_admin IS NULL THEN
    RAISE EXCEPTION 'access matrix: no non-admin profiles row to act as the caller';
  END IF;

  -- is_privileged(): true only for no-request / service_role / admin.
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT is_privileged() THEN
    RAISE EXCEPTION 'is_privileged: must be TRUE with no request claims (psql, GoTrue, cron)';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT is_privileged() THEN
    RAISE EXCEPTION 'is_privileged: must be TRUE for the service role';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF is_privileged() THEN
    RAISE EXCEPTION 'is_privileged: must be FALSE for the anon key (01-P3)';
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', non_admin, 'role', 'authenticated')::text, true);
  IF is_privileged() THEN
    RAISE EXCEPTION 'is_privileged: must be FALSE for a signed-in non-admin';
  END IF;
  IF admin_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
    IF NOT is_privileged() THEN
      RAISE EXCEPTION 'is_privileged: must be TRUE for an admin session';
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- profiles.email: the owner cannot move it (01-P2). (a) as the authenticated
-- role the column has no UPDATE grant -> 42501; (b) even with the grant, the
-- guard copies OLD over NEW.
BEGIN;
DO $$
DECLARE
  who uuid;
  before_email text;
  before_token uuid;
  after_email text;
  after_token uuid;
  denied boolean := false;
BEGIN
  SELECT id, email, unsubscribe_token INTO who, before_email, before_token
    FROM profiles WHERE role <> 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', who, 'role', 'authenticated')::text, true);

  PERFORM set_config('role', 'authenticated', true);
  BEGIN
    UPDATE profiles SET email = 'smoke-hijack@example.invalid' WHERE id = who;
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  PERFORM set_config('role', 'none', true);
  IF NOT denied THEN
    RAISE EXCEPTION 'profiles.email: UPDATE as authenticated was NOT denied (grant widened?)';
  END IF;

  -- Owner-path write (RLS bypassed, grant bypassed): the guard alone.
  UPDATE profiles SET email = 'smoke-hijack@example.invalid',
                      unsubscribe_token = gen_random_uuid()
    WHERE id = who;
  SELECT email, unsubscribe_token INTO after_email, after_token FROM profiles WHERE id = who;
  IF after_email IS DISTINCT FROM before_email THEN
    RAISE EXCEPTION 'profiles.email: guard let a non-privileged caller change it';
  END IF;
  IF after_token IS DISTINCT FROM before_token THEN
    RAISE EXCEPTION 'profiles.unsubscribe_token: guard let a non-privileged caller change it';
  END IF;

  -- The three granted columns still save for the owner.
  PERFORM set_config('role', 'authenticated', true);
  UPDATE profiles SET full_name = full_name WHERE id = who;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- follows: anon sees no rows, a user sees only their own, and the public
-- count comes through follower_count() (01-P2, D3).
BEGIN;
DO $$
DECLARE
  total bigint;
  seen bigint;
  a_follower uuid;
  an_artist uuid;
  own bigint;
  fn_count bigint;
BEGIN
  SELECT count(*) INTO total FROM follows;
  IF total = 0 THEN
    RAISE NOTICE 'follows matrix: no follows rows on this database; visibility checks are vacuous';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('role', 'anon', true);
  SELECT count(*) INTO seen FROM follows;
  IF seen <> 0 THEN
    RAISE EXCEPTION 'follows: anon can read % rows of the follow graph', seen;
  END IF;
  PERFORM set_config('role', 'none', true);

  IF total > 0 THEN
    SELECT follower_id, artist_id INTO a_follower, an_artist FROM follows LIMIT 1;
    SELECT count(*) INTO own FROM follows WHERE follower_id = a_follower;
    PERFORM set_config('request.jwt.claims',
                       json_build_object('sub', a_follower, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
    SELECT count(*) INTO seen FROM follows;
    PERFORM set_config('role', 'none', true);
    IF seen <> own THEN
      RAISE EXCEPTION 'follows: a user sees % rows, expected their own % rows', seen, own;
    END IF;

    SELECT count(*) INTO total FROM follows WHERE artist_id = an_artist;
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
    SELECT follower_count(an_artist) INTO fn_count;
    PERFORM set_config('role', 'none', true);
    IF fn_count <> total THEN
      RAISE EXCEPTION 'follower_count: returned % for anon, expected the public number %', fn_count, total;
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- website_url: only http(s) survives the CHECK on both profile tables.
BEGIN;
DO $$
DECLARE
  tbl text;
  has_rows boolean;
  rejected boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['gallery_profiles', 'artist_profiles'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = tbl || '_website_url_scheme' AND conrelid = ('public.' || tbl)::regclass
    ) THEN
      RAISE EXCEPTION '%: website_url scheme CHECK is missing', tbl;
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', tbl) INTO has_rows;
    IF NOT has_rows THEN
      RAISE NOTICE '%: no rows; CHECK exists but the reject path was not exercised', tbl;
      CONTINUE;
    END IF;
    rejected := false;
    BEGIN
      EXECUTE format('UPDATE %I SET website_url = $1 WHERE id = (SELECT id FROM %I LIMIT 1)', tbl, tbl)
        USING 'javascript:alert(document.cookie)';
    EXCEPTION WHEN check_violation THEN rejected := true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION '%: a javascript: website_url was ACCEPTED', tbl;
    END IF;
  END LOOP;
END $$;
ROLLBACK;

-- verification_requests / reports: the INSERT policies pin the review
-- columns (01 appendix).
DO $$
DECLARE expr text;
BEGIN
  SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO expr
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'verification_requests' AND p.polname = 'Artists create own verification requests';
  IF expr IS NULL OR expr NOT LIKE '%status = ''pending''%' THEN
    RAISE EXCEPTION 'verification_requests INSERT policy does not pin status = pending: %', expr;
  END IF;
  SELECT pg_get_expr(p.polwithcheck, p.polrelid) INTO expr
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'reports' AND p.polname = 'Users can create reports';
  IF expr IS NULL OR expr NOT LIKE '%status = ''pending''%'
     OR expr NOT LIKE '%admin_notes IS NULL%' OR expr NOT LIKE '%resolved_by IS NULL%' THEN
    RAISE EXCEPTION 'reports INSERT policy does not pin status/admin_notes/resolved_by: %', expr;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Storage policy matrix (00056, R14 / 01-r2 P2). The exact set of
--    (verb, policy) rows on storage.objects is pinned: the five public
--    buckets must carry NO SELECT policy (public-URL GETs need none; a
--    SELECT policy is what lets the anon key list every uploader's folder),
--    and the private chat bucket keeps its participant-scoped read. Then the
--    behaviour: anon and a signed-in non-owner see zero rows in each public
--    bucket. Buckets with no objects on this database are vacuous for the
--    count check but still pinned by the matrix.
-- ---------------------------------------------------------------------------
BEGIN;
CREATE TEMP TABLE expected_storage_policies(cmd text, pol text) ON COMMIT DROP;
INSERT INTO expected_storage_policies VALUES
  ('a','Artists can upload own photos'),
  ('a','Artists can upload own videos'),
  ('a','Authenticated users can upload chat attachments'),
  ('a','Authenticated users can upload listing images'),
  ('a','Users can upload own avatar'),
  ('a','Users can upload own banner'),
  ('d','Artists can delete own photos'),
  ('d','Artists can delete own videos'),
  ('d','Users can delete own avatar'),
  ('d','Users can delete own banner'),
  ('d','Users can delete own listing images'),
  ('r','Participants view chat attachments'),
  ('w','Users can update own avatar'),
  ('w','Users can update own banner');

DO $$
DECLARE diff text;
BEGIN
  SELECT string_agg(marker || ' ' || row, E'\n' ORDER BY marker, row) INTO diff FROM (
    SELECT 'UNEXPECTED storage policy:' AS marker,
           p.polcmd::text || ' | ' || p.polname AS row
      FROM pg_policy p
      WHERE p.polrelid = 'storage.objects'::regclass
        AND (p.polcmd::text, p.polname) NOT IN (SELECT cmd, pol FROM expected_storage_policies)
    UNION ALL
    SELECT 'MISSING storage policy (dropped or renamed):', e.cmd || ' | ' || e.pol
      FROM expected_storage_policies e
      WHERE (e.cmd, e.pol) NOT IN (
        SELECT p.polcmd::text, p.polname FROM pg_policy p
        WHERE p.polrelid = 'storage.objects'::regclass)
  ) d;
  IF diff IS NOT NULL THEN
    RAISE EXCEPTION E'storage policy drift:\n%', diff;
  END IF;
  -- Belt and braces: whatever the names, no SELECT policy may name a public
  -- bucket, and every SELECT policy must be scoped beyond bucket_id alone.
  SELECT string_agg(p.polname, ', ') INTO diff
    FROM pg_policy p
    WHERE p.polrelid = 'storage.objects'::regclass AND p.polcmd = 'r'
      AND pg_get_expr(p.polqual, p.polrelid) ~ '(listing-images|avatars|banners|artist-photos|artist-videos)';
  IF diff IS NOT NULL THEN
    RAISE EXCEPTION 'storage: SELECT policy on a public bucket (anon can list it): %', diff;
  END IF;
END $$;

DO $$
DECLARE
  bucket text;
  seen bigint;
  total bigint;
  non_owner uuid;
BEGIN
  SELECT id INTO non_owner FROM profiles WHERE role <> 'admin' LIMIT 1;
  FOREACH bucket IN ARRAY ARRAY['listing-images','avatars','banners','artist-photos','artist-videos'] LOOP
    SELECT count(*) INTO total FROM storage.objects WHERE bucket_id = bucket;
    IF total = 0 THEN
      RAISE NOTICE 'storage: bucket % has no objects; the anon-list check is vacuous', bucket;
    END IF;

    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
    SELECT count(*) INTO seen FROM storage.objects WHERE bucket_id = bucket;
    PERFORM set_config('role', 'none', true);
    IF seen <> 0 THEN
      RAISE EXCEPTION 'storage: anon can list % objects in bucket % (01-r2 P2)', seen, bucket;
    END IF;

    IF non_owner IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
                         json_build_object('sub', non_owner, 'role', 'authenticated')::text, true);
      PERFORM set_config('role', 'authenticated', true);
      SELECT count(*) INTO seen FROM storage.objects
        WHERE bucket_id = bucket AND (storage.foldername(name))[1] <> non_owner::text;
      PERFORM set_config('role', 'none', true);
      IF seen <> 0 THEN
        RAISE EXCEPTION 'storage: a signed-in user can list % other people''s objects in bucket %', seen, bucket;
      END IF;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 8. Chat type guards (00056, R14 / 01-r2 P2). A participant may post
--    text/image/file/listing_card; `system` and `quote_card` (message and
--    attachment) are platform-only. The privileged path (service role: no
--    claims) must still post them — the webhook's pickup notice and the
--    commission accept route depend on it. Attachment metadata is frozen for
--    non-privileged UPDATE. Fixture: a fresh conversation between two
--    profiles, rolled back.
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  p1 uuid;
  p2 uuid;
  conv uuid;
  msg uuid;
  att uuid;
  denied boolean;
  meta_after jsonb;
  as_user text;
BEGIN
  SELECT id INTO p1 FROM profiles WHERE role <> 'admin' ORDER BY created_at LIMIT 1;
  SELECT id INTO p2 FROM profiles WHERE role <> 'admin' AND id <> p1 ORDER BY created_at LIMIT 1;
  IF p1 IS NULL OR p2 IS NULL THEN
    -- A fresh database (prod before launch) has no two non-admin profiles;
    -- mint throwaway users inside this rolled-back transaction. The
    -- handle_new_user trigger creates their profiles rows.
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'smoke.chat1.' || gen_random_uuid() || '@customcanvas.dev', '{"full_name":"Smoke One"}'::jsonb);
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'smoke.chat2.' || gen_random_uuid() || '@customcanvas.dev', '{"full_name":"Smoke Two"}'::jsonb);
    SELECT id INTO p1 FROM profiles WHERE email LIKE 'smoke.chat1.%' LIMIT 1;
    SELECT id INTO p2 FROM profiles WHERE email LIKE 'smoke.chat2.%' LIMIT 1;
    IF p1 IS NULL OR p2 IS NULL THEN
      RAISE EXCEPTION 'chat guards: could not mint throwaway profiles for the fixture';
    END IF;
  END IF;
  INSERT INTO conversations (participant_one, participant_two, context_type)
    VALUES (p1, p2, 'listing') RETURNING id INTO conv;
  as_user := json_build_object('sub', p1, 'role', 'authenticated')::text;

  -- Non-privileged: text passes, system and quote_card raise.
  PERFORM set_config('request.jwt.claims', as_user, true);
  INSERT INTO messages (conversation_id, sender_id, content, message_type)
    VALUES (conv, p1, 'smoke text', 'text') RETURNING id INTO msg;

  denied := false;
  BEGIN
    INSERT INTO messages (conversation_id, sender_id, content, message_type)
      VALUES (conv, p1, 'Custom Canvas: re-enter your bank details', 'system');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'chat guards: a participant posted a system message';
  END IF;

  denied := false;
  BEGIN
    INSERT INTO messages (conversation_id, sender_id, content, message_type)
      VALUES (conv, p1, 'Sent a commission quote', 'quote_card');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'chat guards: a participant posted a quote_card message';
  END IF;

  -- Attachments: image on the text message passes; quote_card raises.
  INSERT INTO message_attachments (message_id, attachment_type, url, metadata)
    VALUES (msg, 'image', p1::text || '/smoke.jpg', '{}') RETURNING id INTO att;
  denied := false;
  BEGIN
    INSERT INTO message_attachments (message_id, attachment_type, url, metadata)
      VALUES (msg, 'quote_card', NULL, '{"quoted_price_cents": 100}');
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'chat guards: a participant attached a quote_card';
  END IF;

  -- Non-privileged UPDATE cannot rewrite attachment metadata or type.
  UPDATE message_attachments SET metadata = '{"quoted_price_cents": 1}', attachment_type = 'file'
    WHERE id = att;
  SELECT metadata INTO meta_after FROM message_attachments WHERE id = att;
  IF meta_after <> '{}'::jsonb THEN
    RAISE EXCEPTION 'chat guards: attachment metadata was rewritten by a non-privileged UPDATE';
  END IF;

  -- Privileged (service role): system and quote_card still post.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO messages (conversation_id, sender_id, content, message_type)
    VALUES (conv, p1, 'Order is ready to coordinate for local pickup.', 'system');
  INSERT INTO messages (conversation_id, sender_id, content, message_type)
    VALUES (conv, p1, 'Sent a commission quote', 'quote_card') RETURNING id INTO msg;
  INSERT INTO message_attachments (message_id, attachment_type, url, metadata)
    VALUES (msg, 'quote_card', NULL, '{"quoted_price_cents": 100000}');
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 9. commissions INSERT guard (00056, R14 / 01-r2 P3). A client-created
--    commission is always `pending` with every artist/admin-owned column
--    null, and only a live artist can be its target. The privileged path
--    keeps what it is given (admin tooling / seeds).
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  live_artist uuid;
  dark_artist uuid;
  requester uuid;
  c commissions%ROWTYPE;
  denied boolean;
BEGIN
  SELECT id INTO live_artist FROM artist_profiles WHERE is_live LIMIT 1;
  IF live_artist IS NULL THEN
    RAISE EXCEPTION 'commissions guard: no live artist to build the fixture from';
  END IF;
  SELECT ap.id INTO dark_artist FROM artist_profiles ap WHERE NOT ap.is_live LIMIT 1;
  IF dark_artist IS NULL THEN
    -- Darken one inside this rolled-back transaction (privileged: no claims).
    SELECT id INTO dark_artist FROM artist_profiles WHERE id <> live_artist LIMIT 1;
    IF dark_artist IS NULL THEN
      -- Mint a throwaway dark artist inside this rolled-back transaction.
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'smoke.darkartist.' || gen_random_uuid() || '@customcanvas.dev', '{"full_name":"Smoke Dark Artist"}'::jsonb);
      INSERT INTO artist_profiles (profile_id, slug, display_name, is_live)
        SELECT id, 'smoke-dark-' || substr(id::text, 1, 8), 'Smoke Dark Artist', false
        FROM profiles WHERE email LIKE 'smoke.darkartist.%' LIMIT 1
        RETURNING id INTO dark_artist;
    END IF;
    UPDATE artist_profiles SET is_live = false WHERE id = dark_artist;
  END IF;
  SELECT p.id INTO requester FROM profiles p
    WHERE p.role <> 'admin'
      AND p.id NOT IN (SELECT profile_id FROM artist_profiles WHERE id IN (live_artist, dark_artist))
    LIMIT 1;
  IF requester IS NULL THEN
    -- Mint a throwaway requester inside this rolled-back transaction.
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'smoke.requester.' || gen_random_uuid() || '@customcanvas.dev', '{"full_name":"Smoke Requester"}'::jsonb);
    SELECT id INTO requester FROM profiles WHERE email LIKE 'smoke.requester.%' LIMIT 1;
    IF requester IS NULL THEN
      RAISE EXCEPTION 'commissions guard: could not mint a throwaway requester';
    END IF;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', requester, 'role', 'authenticated')::text, true);

  -- Every artist/admin-owned value is discarded; status is forced to pending.
  INSERT INTO commissions (artist_id, requester_id, title, description, budget_min_cents, budget_max_cents,
                           status, quoted_price_cents, estimated_completion, artist_notes,
                           closed_by, closed_reason, dispute_reason, pre_dispute_status, last_nudge_at)
    VALUES (live_artist, requester, 'smoke', 'smoke description', 10000, 20000,
            'disputed', 999999, 'tomorrow', 'forged', 'admin', 'forged', 'forged', 'in_progress', now())
    RETURNING * INTO c;
  IF c.status <> 'pending' OR c.quoted_price_cents IS NOT NULL OR c.estimated_completion IS NOT NULL
     OR c.artist_notes IS NOT NULL OR c.closed_by IS NOT NULL OR c.closed_reason IS NOT NULL
     OR c.dispute_reason IS NOT NULL OR c.pre_dispute_status IS NOT NULL OR c.last_nudge_at IS NOT NULL THEN
    RAISE EXCEPTION 'commissions guard: a client-set status/quote/close/dispute column survived the insert';
  END IF;

  -- A non-live artist cannot be targeted.
  denied := false;
  BEGIN
    INSERT INTO commissions (artist_id, requester_id, title, description, budget_min_cents, budget_max_cents)
      VALUES (dark_artist, requester, 'smoke', 'smoke description', 10000, 20000);
  EXCEPTION WHEN raise_exception THEN denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'commissions guard: a commission was created for a non-live artist';
  END IF;

  -- Privileged: values are kept.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO commissions (artist_id, requester_id, title, description, budget_min_cents, budget_max_cents,
                           status, quoted_price_cents)
    VALUES (live_artist, requester, 'smoke', 'smoke description', 10000, 20000, 'quoted', 15000)
    RETURNING * INTO c;
  IF c.status <> 'quoted' OR c.quoted_price_cents <> 15000 THEN
    RAISE EXCEPTION 'commissions guard: the privileged path lost its values';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

-- ---------------------------------------------------------------------------
-- 10. Acceptance record freeze (00058, L2). The four acceptance columns on
--     profiles are a legal record: an account may not write, backdate or
--     downgrade its own acceptance. Two locks are asserted here — the columns
--     carry no UPDATE grant (so a client write is 42501), and
--     guard_profiles_update restores them even if a grant ever appears.
--     Also asserts they carry no SELECT grant: the client learns what it owes
--     from GET /api/account/acceptance, not from the row.
-- ---------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  victim uuid;
  leaked text;
  after_row profiles%ROWTYPE;
BEGIN
  -- No SELECT and no UPDATE on the acceptance columns, for either browser
  -- role. (INSERT/REFERENCES are inherited table-level grants and show up on
  -- every profiles column; they are unreachable because profiles has no
  -- INSERT policy — rows are minted by the handle_new_user trigger.)
  SELECT string_agg(column_name || ' -> ' || grantee || ' (' || privilege_type || ')', ', ')
    INTO leaked
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'profiles'
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('SELECT','UPDATE')
     AND column_name IN ('terms_version','terms_accepted_at',
                         'terms_of_sale_version','terms_of_sale_accepted_at');
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'acceptance columns are client-readable/writable: %', leaked;
  END IF;

  SELECT id INTO victim FROM profiles WHERE role <> 'admin' LIMIT 1;
  IF victim IS NULL THEN
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
      VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
              'smoke.acceptance.' || gen_random_uuid() || '@customcanvas.dev', '{"full_name":"Smoke Acceptance"}'::jsonb);
    SELECT id INTO victim FROM profiles WHERE email LIKE 'smoke.acceptance.%' LIMIT 1;
    IF victim IS NULL THEN
      RAISE EXCEPTION 'acceptance freeze: could not mint a throwaway profile';
    END IF;
  END IF;

  -- Privileged: the acceptance route's write must land.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE profiles
     SET terms_version = '2.0', terms_accepted_at = now(),
         terms_of_sale_version = '2.0', terms_of_sale_accepted_at = now()
   WHERE id = victim;
  SELECT * INTO after_row FROM profiles WHERE id = victim;
  IF after_row.terms_version <> '2.0' OR after_row.terms_accepted_at IS NULL THEN
    RAISE EXCEPTION 'acceptance freeze: the privileged (service-role) write did not land';
  END IF;

  -- Non-privileged: the account cannot rewrite its own acceptance record,
  -- downgrade the version, or backdate the timestamp. The trigger restores
  -- every one of them, so the UPDATE is a no-op rather than an error.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', victim, 'role', 'authenticated')::text, true);
  UPDATE profiles
     SET terms_version = '9.9', terms_accepted_at = '2000-01-01',
         terms_of_sale_version = '9.9', terms_of_sale_accepted_at = '2000-01-01'
   WHERE id = victim;
  SELECT * INTO after_row FROM profiles WHERE id = victim;
  IF after_row.terms_version <> '2.0'
     OR after_row.terms_of_sale_version <> '2.0'
     OR after_row.terms_accepted_at < '2020-01-01'
     OR after_row.terms_of_sale_accepted_at < '2020-01-01' THEN
    RAISE EXCEPTION 'acceptance freeze: an account rewrote its own acceptance record';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
ROLLBACK;

\echo 'db-smoke: all checks passed'
