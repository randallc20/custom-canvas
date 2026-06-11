-- ============================================================
-- Custom Canvas — Migration 00002
-- Missing tables, RLS policies, indexes, storage, realtime
-- ============================================================

-- ============================================================
-- ARTIST EDUCATION
-- ============================================================
CREATE TABLE artist_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT,
  field_of_study TEXT,
  start_year INT,
  end_year INT,
  is_current BOOLEAN DEFAULT FALSE,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE artist_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artist education visible to all" ON artist_education FOR SELECT USING (true);
CREATE POLICY "Artists can manage own education" ON artist_education FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can update own education" ON artist_education FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can delete own education" ON artist_education FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- ============================================================
-- ARTIST PERSONAL PHOTOS (Meet the Artist)
-- ============================================================
CREATE TABLE artist_personal_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE artist_personal_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Personal photos visible to all" ON artist_personal_photos FOR SELECT USING (true);
CREATE POLICY "Artists can manage own photos" ON artist_personal_photos FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can update own photos" ON artist_personal_photos FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can delete own photos" ON artist_personal_photos FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- ============================================================
-- ARTIST VIDEOS
-- ============================================================
CREATE TABLE artist_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE artist_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artist videos visible to all" ON artist_videos FOR SELECT USING (true);
CREATE POLICY "Artists can manage own videos" ON artist_videos FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can update own videos" ON artist_videos FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can delete own videos" ON artist_videos FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- ============================================================
-- LISTING SERIES
-- ============================================================
CREATE TABLE listing_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER listing_series_updated_at BEFORE UPDATE ON listing_series
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE listing_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Series visible to all" ON listing_series FOR SELECT USING (true);
CREATE POLICY "Artists can manage own series" ON listing_series FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can update own series" ON listing_series FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can delete own series" ON listing_series FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- Add series_id to listings
ALTER TABLE listings ADD COLUMN series_id UUID REFERENCES listing_series(id) ON DELETE SET NULL;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'new_message','new_follower','new_order',
    'commission_request','commission_accepted','commission_declined',
    'commission_completed','commission_confirmed','commission_disputed',
    'review_received','listing_reported','payout_sent'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX notifications_user_unread_idx ON notifications(user_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own notifications" ON notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('inappropriate','copyright','misleading','spam','other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','action_taken')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER reports_updated_at BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create reports" ON reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can see own reports" ON reports FOR SELECT
  USING (auth.uid() = reporter_id);
-- Admin policies handled via service role key on server

-- ============================================================
-- ANALYTICS EVENTS
-- ============================================================
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view','listing_view','listing_save','listing_share','follow')),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX analytics_artist_type_idx ON analytics_events(artist_id, event_type, created_at DESC);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artists can see own analytics" ON analytics_events FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Anyone can insert analytics events" ON analytics_events FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- PINNED LISTINGS (artist can pin up to 6 listings)
-- ============================================================
ALTER TABLE artist_profiles ADD COLUMN pinned_listing_ids UUID[] DEFAULT '{}';

-- ============================================================
-- MISSING RLS POLICIES ON EXISTING TABLES
-- ============================================================

-- Follows: follower count should be publicly visible
CREATE POLICY "Follow counts visible to all" ON follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can see own follows" ON follows;

-- Orders: users need INSERT to create orders
CREATE POLICY "Buyers can create orders" ON orders FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Orders: artists/admins can update order status
CREATE POLICY "Artists can update own orders" ON orders FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- Conversations: participants can update (for last_message updates)
CREATE POLICY "Participants can update conversations" ON conversations FOR UPDATE
  USING (auth.uid() = participant_one OR auth.uid() = participant_two);

-- Message attachments: participants can insert
CREATE POLICY "Participants can add attachments" ON message_attachments FOR INSERT
  WITH CHECK (message_id IN (
    SELECT m.id FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.participant_one = auth.uid() OR c.participant_two = auth.uid()
  ));

-- Notifications: service role inserts (no user INSERT policy needed)

-- ============================================================
-- REALTIME for new tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES
  ('listing-images', 'listing-images', true),
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('chat-attachments', 'chat-attachments', false),
  ('artist-photos', 'artist-photos', true),
  ('artist-videos', 'artist-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: listing images
CREATE POLICY "Anyone can view listing images" ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-images');
CREATE POLICY "Authenticated users can upload listing images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'listing-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete own listing images" ON storage.objects FOR DELETE
  USING (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: avatars
CREATE POLICY "Anyone can view avatars" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: banners
CREATE POLICY "Anyone can view banners" ON storage.objects FOR SELECT
  USING (bucket_id = 'banners');
CREATE POLICY "Users can upload own banner" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own banner" ON storage.objects FOR UPDATE
  USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own banner" ON storage.objects FOR DELETE
  USING (bucket_id = 'banners' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: chat attachments (private)
CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can view chat attachments" ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments' AND auth.role() = 'authenticated');

-- Storage policies: artist photos
CREATE POLICY "Anyone can view artist photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'artist-photos');
CREATE POLICY "Artists can upload own photos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'artist-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Artists can delete own photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'artist-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies: artist videos
CREATE POLICY "Anyone can view artist videos" ON storage.objects FOR SELECT
  USING (bucket_id = 'artist-videos');
CREATE POLICY "Artists can upload own videos" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'artist-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Artists can delete own videos" ON storage.objects FOR DELETE
  USING (bucket_id = 'artist-videos' AND auth.uid()::text = (storage.foldername(name))[1]);
