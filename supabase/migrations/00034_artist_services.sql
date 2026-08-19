-- Artist Services directory v0 (Chris decision 2026-08-18): a curated,
-- admin-managed list of local service providers (photographers first) that
-- artists can hire directly. No booking/payments through the platform —
-- validates demand before building a marketplace around it.

CREATE TABLE artist_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'photographer'
    CHECK (category IN ('photographer', 'framing', 'printing', 'other')),
  blurb TEXT,
  city TEXT NOT NULL DEFAULT 'Houston',
  contact_email TEXT,
  contact_phone TEXT,
  website_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER artist_services_updated_at BEFORE UPDATE ON artist_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE artist_services ENABLE ROW LEVEL SECURITY;

-- Artist-facing directory: signed-in users see active entries. No public
-- (anon) read — it's a seller resource, not a marketing surface. All writes
-- go through admin-checked service-role API routes (no user-role policies).
CREATE POLICY "Active services visible to signed-in users" ON artist_services
  FOR SELECT USING (auth.uid() IS NOT NULL AND is_active = true);
