-- Phase 8: Houston Verified request flow.
CREATE TABLE verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  connection_type TEXT NOT NULL,
  details TEXT NOT NULL,
  links TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;

-- Artists manage their own requests; admins see all (via the admin role check).
CREATE POLICY "Artists view own verification requests" ON verification_requests FOR SELECT
  USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Artists create own verification requests" ON verification_requests FOR INSERT
  WITH CHECK (artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid()));

-- One open request at a time per artist.
CREATE UNIQUE INDEX one_pending_verification_per_artist ON verification_requests (artist_id)
  WHERE status = 'pending';
