-- Final-review follow-through (2026-08-18): the listing-visibility gate
-- (00033) stopped at the listings table. Child/media tables kept
-- USING(true) SELECT, so an anon caller could still enumerate a draft or
-- rejected artist's artwork images, tags, education, and personal photos via
-- PostgREST — reconstructing exactly what the gate hides. Same fix pattern
-- everywhere: publicly readable only when the owning artist is live; the
-- owner and admins keep full access.

-- Helper predicates used repeatedly below (inlined; RLS policies can't call
-- non-immutable helpers cheaply, and EXISTS-by-PK is fast).

-- (1) artist_profiles itself: non-live shops are simply not readable by the
-- public. This also stops anon enumeration of who applied/was rejected
-- (application_status was readable on every row). Owner keeps their row;
-- admins need a policy of their own (00028 never covered artist_profiles).
DROP POLICY IF EXISTS "Artist profiles visible to all" ON artist_profiles;
CREATE POLICY "Live artist profiles visible to all" ON artist_profiles
  FOR SELECT USING (
    is_live = true
    OR profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- (2) listing_images / listing_tags: readable when their listing is
-- publicly readable (mirrors the 00033 listings policy).
DROP POLICY IF EXISTS "Listing images visible to all" ON listing_images;
CREATE POLICY "Listing images follow listing visibility" ON listing_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM listings l
      JOIN artist_profiles ap ON ap.id = l.artist_id
      WHERE l.id = listing_images.listing_id
        AND l.status NOT IN ('hidden', 'draft')
        AND ap.is_live = true
    )
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN artist_profiles ap ON ap.id = l.artist_id
      WHERE l.id = listing_images.listing_id AND ap.profile_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Listing tags visible to all" ON listing_tags;
CREATE POLICY "Listing tags follow listing visibility" ON listing_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM listings l
      JOIN artist_profiles ap ON ap.id = l.artist_id
      WHERE l.id = listing_tags.listing_id
        AND l.status NOT IN ('hidden', 'draft')
        AND ap.is_live = true
    )
    OR EXISTS (
      SELECT 1 FROM listings l
      JOIN artist_profiles ap ON ap.id = l.artist_id
      WHERE l.id = listing_tags.listing_id AND ap.profile_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- (3) Artist media/education: follow the artist's liveness.
DROP POLICY IF EXISTS "Artist education visible to all" ON artist_education;
CREATE POLICY "Artist education follows artist visibility" ON artist_education
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = artist_education.artist_id
        AND (ap.is_live = true OR ap.profile_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Personal photos visible to all" ON artist_personal_photos;
CREATE POLICY "Personal photos follow artist visibility" ON artist_personal_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = artist_personal_photos.artist_id
        AND (ap.is_live = true OR ap.profile_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Artist videos visible to all" ON artist_videos;
CREATE POLICY "Artist videos follow artist visibility" ON artist_videos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM artist_profiles ap
      WHERE ap.id = artist_videos.artist_id
        AND (ap.is_live = true OR ap.profile_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
