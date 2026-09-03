-- Completeness-score parity fixture (R11) — the source of the hard-coded SQL
-- numbers in src/utils/completenessScore.test.ts.
--
--   PGPASSWORD=$(grep '^SUPABASE_DB_PASSWORD=' .env.local | cut -d= -f2- | tr -d '"') \
--     psql -h <pooler host> -U <db user> -d postgres -f scripts/completeness-parity.sql
--
-- Runs on DEV inside ONE transaction
-- that is ROLLED BACK: it creates eight synthetic artists in the states the
-- TS calculateCompletenessScore branches on, calls the SQL
-- refresh_completeness_score() on each, and prints the results. Nothing
-- survives the rollback.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE fixture(name text, artist_id uuid, score int) ON COMMIT DROP;

DO $fix$
DECLARE
  spec RECORD;
  uid uuid;
  aid uuid;
  n int := 0;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- name, display_name, story, primary_mediums, neighborhood,
      -- fulfillment_pref, avatar_url, banner_image_url, has_listings,
      -- stripe_onboarded, has_education, has_personal_photo
      ('empty',            NULL::text, NULL::text, NULL::text[], NULL::text, NULL::text, NULL::text, NULL::text, false, false, false, false),
      ('name only',        'Ada Rivers', NULL, NULL, NULL, NULL, NULL, NULL, false, false, false, false),
      ('short story',      'Ada Rivers', 'Too short to count.', NULL, NULL, NULL, NULL, NULL, false, false, false, false),
      ('story at 100',     'Ada Rivers', repeat('a', 100), NULL, NULL, NULL, NULL, NULL, false, false, false, false),
      ('story padded 99',  'Ada Rivers', '  ' || repeat('b', 99) || '  ', NULL, NULL, NULL, NULL, NULL, false, false, false, false),
      ('mid profile',      'Ada Rivers', repeat('c', 140), ARRAY['oil','gouache'], 'Montrose', 'ships_national', 'https://cdn/avatar.png', NULL, true, false, false, false),
      ('everything',       'Ada Rivers', repeat('d', 140), ARRAY['oil'], 'Montrose', 'pickup_only', 'https://cdn/avatar.png', 'https://cdn/banner.png', true, true, true, true),
      ('blank strings',    '   ', '   ', ARRAY[]::text[], '   ', NULL, '', '', false, false, false, false)
    ) AS t(name, display_name, story, primary_mediums, neighborhood, fulfillment_pref,
           avatar_url, banner_image_url, has_listings, stripe_onboarded, has_education, has_personal_photo)
  LOOP
    n := n + 1;
    uid := gen_random_uuid();
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'r11.parity.' || n || '@example.invalid', '', now(), now(), now(),
            '{"provider":"email"}'::jsonb,
            jsonb_build_object('role', 'artist', 'full_name', 'R11 Parity ' || n));

    -- handle_new_user() may or may not have created the profiles row.
    INSERT INTO profiles (id, email, role, full_name)
    VALUES (uid, 'r11.parity.' || n || '@example.invalid', 'artist', 'R11 Parity ' || n)
    ON CONFLICT (id) DO NOTHING;
    UPDATE profiles SET avatar_url = spec.avatar_url WHERE id = uid;

    INSERT INTO artist_profiles (profile_id, slug, display_name, story, primary_mediums,
                                 neighborhood, fulfillment_pref, banner_image_url, stripe_onboarded)
    VALUES (uid, 'r11-parity-' || n, coalesce(spec.display_name, ''), spec.story, spec.primary_mediums,
            spec.neighborhood, spec.fulfillment_pref, spec.banner_image_url, spec.stripe_onboarded)
    RETURNING id INTO aid;

    IF spec.has_listings THEN
      INSERT INTO listings (artist_id, title, medium, price_cents)
      VALUES (aid, 'R11 Parity Piece ' || n, 'Oil on panel', 12500);
    END IF;
    IF spec.has_education THEN
      INSERT INTO artist_education (artist_id, institution) VALUES (aid, 'R11 Parity School');
    END IF;
    IF spec.has_personal_photo THEN
      INSERT INTO artist_personal_photos (artist_id, image_url) VALUES (aid, 'https://cdn/photo.png');
    END IF;

    INSERT INTO fixture(name, artist_id) VALUES (spec.name, aid);
  END LOOP;
END
$fix$;

UPDATE fixture SET score = refresh_completeness_score(artist_id);

SELECT f.name,
       a.display_name,
       (a.story IS NOT NULL) AS has_story,
       length(trim(coalesce(a.story, ''))) AS story_len,
       coalesce(array_length(a.primary_mediums, 1), 0) AS mediums,
       a.neighborhood,
       a.fulfillment_pref,
       p.avatar_url,
       a.banner_image_url,
       a.stripe_onboarded,
       f.score
FROM fixture f
JOIN artist_profiles a ON a.id = f.artist_id
JOIN profiles p ON p.id = a.profile_id
ORDER BY f.name;

ROLLBACK;
