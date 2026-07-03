-- Build 3 Phase 2: admin-curated homepage "Featured" shelf.
-- A small ordered set of listings chosen by the platform curator. Sold or
-- hidden pieces drop out of the shelf automatically because reads join on
-- listings.status; rows for deleted listings cascade away.
--
-- Note: listings.is_featured (00001) is a legacy, never-wired boolean and is
-- NOT part of this mechanism — featured_listings is the single source of
-- truth for homepage curation.
CREATE TABLE featured_listings (
  listing_id UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  display_order INT NOT NULL DEFAULT 0,
  featured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE featured_listings ENABLE ROW LEVEL SECURITY;

-- The shelf is public (anon homepage reads it); curation is admin-only.
-- IMPORTANT: not is_privileged() here — that helper returns true for
-- sessionless (anon-key) calls, which is correct for column-guard triggers
-- but would open these row policies to anonymous writes.
CREATE POLICY "Featured shelf is public" ON featured_listings
  FOR SELECT USING (true);
CREATE POLICY "Admins add featured listings" ON featured_listings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins reorder featured listings" ON featured_listings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins remove featured listings" ON featured_listings
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- The shelf cap is a product promise ("up to 10"), so enforce it at the DB —
-- client-side gating can't stop concurrent admin tabs.
CREATE OR REPLACE FUNCTION enforce_featured_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT COUNT(*) FROM featured_listings) >= 10 THEN
    RAISE EXCEPTION 'The Featured shelf is limited to 10 pieces';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER featured_listings_cap BEFORE INSERT ON featured_listings
  FOR EACH ROW EXECUTE FUNCTION enforce_featured_cap();
