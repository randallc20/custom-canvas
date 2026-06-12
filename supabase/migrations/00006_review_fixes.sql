-- Review fixes: order integrity, draft visibility, server-side completeness.

-- Stripe delivers webhooks at-least-once; the same payment intent must
-- never create two orders.
ALTER TABLE orders ADD CONSTRAINT orders_payment_intent_unique UNIQUE (stripe_payment_intent_id);

-- Drafts are owner-only, like hidden.
DROP POLICY "Listings visible if not hidden" ON listings;
CREATE POLICY "Listings visible if not hidden or draft" ON listings FOR SELECT
  USING (
    status NOT IN ('hidden', 'draft')
    OR artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
  );

-- Canonical completeness score computed from actual data so it cannot go
-- stale when inputs change outside the profile-edit page. Weights mirror
-- src/utils/completenessScore.ts (kept for the live preview bar).
CREATE OR REPLACE FUNCTION refresh_completeness_score(p_artist_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a artist_profiles%ROWTYPE;
  v_avatar TEXT;
  v_score INT := 0;
BEGIN
  SELECT * INTO a FROM artist_profiles WHERE id = p_artist_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT avatar_url INTO v_avatar FROM profiles WHERE id = a.profile_id;

  IF length(trim(coalesce(a.display_name, ''))) > 0 THEN v_score := v_score + 10; END IF;
  IF length(trim(coalesce(a.story, ''))) >= 100 THEN v_score := v_score + 15; END IF;
  IF coalesce(array_length(a.primary_mediums, 1), 0) > 0 THEN v_score := v_score + 5; END IF;
  IF length(trim(coalesce(a.neighborhood, ''))) > 0 THEN v_score := v_score + 5; END IF;
  IF a.fulfillment_pref IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF v_avatar IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF a.banner_image_url IS NOT NULL THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM listings WHERE artist_id = p_artist_id) THEN v_score := v_score + 20; END IF;
  IF a.stripe_onboarded THEN v_score := v_score + 10; END IF;
  IF EXISTS (SELECT 1 FROM artist_education WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;
  IF EXISTS (SELECT 1 FROM artist_personal_photos WHERE artist_id = p_artist_id) THEN v_score := v_score + 5; END IF;

  UPDATE artist_profiles SET completeness_score = v_score WHERE id = p_artist_id;
  RETURN v_score;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_completeness_score(UUID) TO authenticated;
