-- 00054_completeness_score_empty_urls.sql — R11 parity test fallout
-- (docs/REVIEW-FIX-PLAN.md addenda; src/utils/completenessScore.test.ts).
--
-- refresh_completeness_score() awarded the avatar (10) and banner (5) points
-- for any non-NULL value, while the TypeScript scorer the editor shows awards
-- them for a non-empty value. Forms that clear an image save '' rather than
-- NULL, so a cleared avatar scored 15 in the database and 0 on screen.
-- Both sides now agree: an empty or whitespace URL earns nothing, matching
-- how every other text column in this function is already tested.

CREATE OR REPLACE FUNCTION refresh_completeness_score(p_artist_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a artist_profiles%ROWTYPE;
  v_avatar TEXT;
  v_score INT := 0;
BEGIN
  PERFORM set_config('app.privileged', 'on', true);
  SELECT * INTO a FROM artist_profiles WHERE id = p_artist_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT avatar_url INTO v_avatar FROM profiles WHERE id = a.profile_id;

  IF length(trim(coalesce(a.display_name, ''))) > 0 THEN v_score := v_score + 10; END IF;
  IF length(trim(coalesce(a.story, ''))) >= 100 THEN v_score := v_score + 15; END IF;
  IF coalesce(array_length(a.primary_mediums, 1), 0) > 0 THEN v_score := v_score + 5; END IF;
  IF length(trim(coalesce(a.neighborhood, ''))) > 0 THEN v_score := v_score + 5; END IF;
  IF a.fulfillment_pref IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF length(trim(coalesce(v_avatar, ''))) > 0 THEN v_score := v_score + 10; END IF;
  IF length(trim(coalesce(a.banner_image_url, ''))) > 0 THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM listings WHERE artist_id = p_artist_id) THEN v_score := v_score + 20; END IF;
  IF a.stripe_onboarded THEN v_score := v_score + 10; END IF;
  IF EXISTS (SELECT 1 FROM artist_education WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM artist_personal_photos WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;

  UPDATE artist_profiles SET completeness_score = v_score WHERE id = p_artist_id;
  RETURN v_score;
END;
$$;
