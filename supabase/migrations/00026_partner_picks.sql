-- Build 3 Phase 6: partner picks — verified partners curate a handful of
-- listings that surface on their public page and rotate onto the homepage.
-- Partners graduate from trust decor to a discovery engine.
CREATE TABLE partner_picks (
  gallery_id UUID NOT NULL REFERENCES gallery_profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  blurb TEXT CHECK (char_length(blurb) <= 280),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (gallery_id, listing_id)
);

ALTER TABLE partner_picks ENABLE ROW LEVEL SECURITY;

-- Picks are public; only VERIFIED partners curate, and only their own set.
CREATE POLICY "Partner picks are public" ON partner_picks
  FOR SELECT USING (true);
CREATE POLICY "Verified partners add picks" ON partner_picks
  FOR INSERT WITH CHECK (
    gallery_id IN (
      SELECT id FROM gallery_profiles WHERE profile_id = auth.uid() AND is_verified
    )
    -- Only listings the partner can actually see as live: blocks picking
    -- drafts/hidden work and probing foreign listing UUIDs (the subquery
    -- runs under the caller's listings RLS).
    AND EXISTS (SELECT 1 FROM listings WHERE id = listing_id AND status = 'available')
  );
CREATE POLICY "Verified partners update picks" ON partner_picks
  FOR UPDATE USING (
    gallery_id IN (
      SELECT id FROM gallery_profiles WHERE profile_id = auth.uid() AND is_verified
    )
  ) WITH CHECK (
    gallery_id IN (
      SELECT id FROM gallery_profiles WHERE profile_id = auth.uid() AND is_verified
    )
  );
CREATE POLICY "Verified partners remove picks" ON partner_picks
  FOR DELETE USING (
    gallery_id IN (
      SELECT id FROM gallery_profiles WHERE profile_id = auth.uid() AND is_verified
    )
  );

-- Six picks per partner, enforced where concurrent tabs can't cheat it.
CREATE OR REPLACE FUNCTION enforce_partner_picks_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Serialize per-gallery inserts so the COUNT can't race past the cap.
  PERFORM pg_advisory_xact_lock(hashtext('partner_picks_' || NEW.gallery_id::text));
  IF (SELECT COUNT(*) FROM partner_picks WHERE gallery_id = NEW.gallery_id) >= 6 THEN
    RAISE EXCEPTION 'Partners can pick up to 6 pieces';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER partner_picks_cap BEFORE INSERT ON partner_picks
  FOR EACH ROW EXECUTE FUNCTION enforce_partner_picks_cap();
