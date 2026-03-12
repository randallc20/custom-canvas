-- ============================================================
-- Custom Canvas — Initial Schema Migration
-- ============================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('artist','user','gallery','admin')),
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles visible to all" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- ARTIST PROFILES
-- ============================================================
CREATE TABLE artist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  artist_statement TEXT,
  influences TEXT,
  school TEXT,
  graduation_year INT,
  status TEXT CHECK (status IN ('student','recent_grad','working_artist')),
  neighborhood TEXT,
  city TEXT DEFAULT 'Houston',
  website_url TEXT,
  fulfillment_pref TEXT CHECK (fulfillment_pref IN ('ships_national','ships_local','pickup_only','artist_delivered')),
  commissions_open BOOLEAN DEFAULT FALSE,
  commission_desc TEXT,
  commission_min_cents INT,
  commission_turnaround TEXT,
  accent_color TEXT DEFAULT '#E8704A',
  banner_image_url TEXT,
  bio_layout TEXT DEFAULT 'left' CHECK (bio_layout IN ('left','center','minimal')),
  is_houston_verified BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  completeness_score INT DEFAULT 0,
  is_live BOOLEAN DEFAULT FALSE,
  stripe_account_id TEXT,
  stripe_onboarded BOOLEAN DEFAULT FALSE,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX artist_search_idx ON artist_profiles USING GIN(search_vector);
CREATE TRIGGER artist_profiles_updated_at BEFORE UPDATE ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Artist search vector trigger
CREATE OR REPLACE FUNCTION artist_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.display_name, '') || ' ' ||
    COALESCE(NEW.bio, '') || ' ' ||
    COALESCE(NEW.neighborhood, '') || ' ' ||
    COALESCE(NEW.school, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER artist_search_trigger BEFORE INSERT OR UPDATE ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION artist_search_update();

ALTER TABLE artist_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Artist profiles visible to all" ON artist_profiles FOR SELECT USING (true);
CREATE POLICY "Artists can insert own profile" ON artist_profiles FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Artists can update own profile" ON artist_profiles FOR UPDATE USING (auth.uid() = profile_id);

-- ============================================================
-- GALLERY PROFILES
-- ============================================================
CREATE TABLE gallery_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  gallery_name TEXT NOT NULL,
  bio TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT DEFAULT 'Houston',
  website_url TEXT,
  banner_image_url TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER gallery_profiles_updated_at BEFORE UPDATE ON gallery_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE gallery_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gallery profiles visible to all" ON gallery_profiles FOR SELECT USING (true);
CREATE POLICY "Galleries can insert own profile" ON gallery_profiles FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Galleries can update own profile" ON gallery_profiles FOR UPDATE USING (auth.uid() = profile_id);

-- ============================================================
-- LISTINGS
-- ============================================================
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  medium TEXT NOT NULL,
  width_cm NUMERIC,
  height_cm NUMERIC,
  depth_cm NUMERIC,
  year_created INT,
  price_cents INT NOT NULL CHECK (price_cents > 0),
  status TEXT DEFAULT 'available' CHECK (status IN ('available','sold','commission_only','hidden')),
  is_featured BOOLEAN DEFAULT FALSE,
  view_count INT DEFAULT 0,
  save_count INT DEFAULT 0,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX listing_search_idx ON listings USING GIN(search_vector);
CREATE TRIGGER listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION listings_search_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.medium, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_search_trigger BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_search_update();

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listings visible if not hidden" ON listings FOR SELECT
  USING (status != 'hidden' OR artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can insert own listings" ON listings FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can update own listings" ON listings FOR UPDATE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));
CREATE POLICY "Artists can delete own listings" ON listings FOR DELETE
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- ============================================================
-- LISTING IMAGES
-- ============================================================
CREATE TABLE listing_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE listing_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listing images visible to all" ON listing_images FOR SELECT USING (true);
CREATE POLICY "Artists can manage own listing images" ON listing_images FOR ALL
  USING (listing_id IN (SELECT id FROM listings WHERE artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())));

-- ============================================================
-- TAGS
-- ============================================================
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('medium','style','subject','mood'))
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tags visible to all" ON tags FOR SELECT USING (true);

-- ============================================================
-- LISTING TAGS
-- ============================================================
CREATE TABLE listing_tags (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, tag_id)
);

ALTER TABLE listing_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listing tags visible to all" ON listing_tags FOR SELECT USING (true);
CREATE POLICY "Artists can manage own listing tags" ON listing_tags FOR ALL
  USING (listing_id IN (SELECT id FROM listings WHERE artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())));

-- ============================================================
-- SAVED LISTINGS
-- ============================================================
CREATE TABLE saved_listings (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (profile_id, listing_id)
);

ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own saves" ON saved_listings FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "Users can save" ON saved_listings FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can unsave" ON saved_listings FOR DELETE USING (auth.uid() = profile_id);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, artist_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can see own follows" ON follows FOR SELECT USING (auth.uid() = follower_id);
CREATE POLICY "Users can follow" ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow" ON follows FOR DELETE USING (auth.uid() = follower_id);

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_two UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  context_type TEXT CHECK (context_type IN ('listing','commission','general')),
  context_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can see own conversations" ON conversations FOR SELECT
  USING (auth.uid() = participant_one OR auth.uid() = participant_two);
CREATE POLICY "Authenticated users can create conversations" ON conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_one);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','image','listing_card','quote_card','system')),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at DESC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants can see messages" ON messages FOR SELECT
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE participant_one = auth.uid() OR participant_two = auth.uid()
  ));
CREATE POLICY "Participants can send messages" ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    conversation_id IN (
      SELECT id FROM conversations WHERE participant_one = auth.uid() OR participant_two = auth.uid()
    )
  );
CREATE POLICY "Recipients can mark as read" ON messages FOR UPDATE
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE participant_one = auth.uid() OR participant_two = auth.uid()
  ));

-- ============================================================
-- MESSAGE ATTACHMENTS
-- ============================================================
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('image','file','listing_card','quote_card')),
  url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attachments visible to conversation participants" ON message_attachments FOR SELECT
  USING (message_id IN (
    SELECT m.id FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.participant_one = auth.uid() OR c.participant_two = auth.uid()
  ));

-- ============================================================
-- COMMISSIONS
-- ============================================================
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  budget_min_cents INT,
  budget_max_cents INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','quoted','accepted','in_progress','completed','delivered','confirmed','disputed','cancelled')),
  quoted_price_cents INT,
  estimated_completion TEXT,
  artist_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER commissions_updated_at BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Commission participants can view" ON commissions FOR SELECT
  USING (
    requester_id = auth.uid() OR
    artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
  );
CREATE POLICY "Users can create commissions" ON commissions FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Involved parties can update commissions" ON commissions FOR UPDATE
  USING (
    requester_id = auth.uid() OR
    artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
  );

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  commission_id UUID REFERENCES commissions(id),
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  platform_fee_cents INT NOT NULL,
  artist_payout_cents INT NOT NULL,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','shipped','delivered','refunded','disputed')),
  shipping_address JSONB,
  tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers can see own orders" ON orders FOR SELECT
  USING (buyer_id = auth.uid());
CREATE POLICY "Artists can see their orders" ON orders FOR SELECT
  USING (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reviews visible to all" ON reviews FOR SELECT USING (true);
CREATE POLICY "Buyers can create reviews" ON reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

-- ============================================================
-- REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
