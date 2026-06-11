-- Gallery-Artist relationship table
CREATE TABLE IF NOT EXISTS gallery_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id uuid NOT NULL REFERENCES gallery_profiles(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'represented' CHECK (role IN ('represented', 'featured', 'alumni')),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(gallery_id, artist_id)
);

-- RLS
ALTER TABLE gallery_artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gallery artists are publicly visible"
  ON gallery_artists FOR SELECT
  USING (true);

CREATE POLICY "Gallery owners can manage their artists"
  ON gallery_artists FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM gallery_profiles
      WHERE gallery_profiles.id = gallery_id
      AND gallery_profiles.profile_id = auth.uid()
    )
  );

CREATE POLICY "Gallery owners can remove artists"
  ON gallery_artists FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM gallery_profiles
      WHERE gallery_profiles.id = gallery_id
      AND gallery_profiles.profile_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_gallery_artists_gallery ON gallery_artists(gallery_id);
CREATE INDEX idx_gallery_artists_artist ON gallery_artists(artist_id);
