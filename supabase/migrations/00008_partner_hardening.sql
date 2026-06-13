-- Phase 4 review fixes: verification integrity + scoped, deterministic linking.

DROP FUNCTION IF EXISTS link_education_partners();

-- 1. Partners could previously set is_verified on their own row (the UPDATE
--    policy has no column restrictions). Verification fields may only change
--    via admins or trusted server contexts; renaming a verified org resets
--    its verification (admin re-approves) and severs alumni links so a
--    rename-to-"Rice University" impostor gains nothing.
CREATE OR REPLACE FUNCTION guard_gallery_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- auth.uid() is NULL for service-role/server contexts; those are trusted.
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR auth.uid() IS NULL INTO is_admin;

  IF NOT is_admin THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'verification status can only be changed by an admin';
    END IF;

    IF NEW.gallery_name IS DISTINCT FROM OLD.gallery_name AND OLD.is_verified THEN
      NEW.is_verified := FALSE;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
      UPDATE artist_education SET partner_id = NULL WHERE partner_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gallery_profile_update_guard ON gallery_profiles;
CREATE TRIGGER gallery_profile_update_guard
  BEFORE UPDATE ON gallery_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_gallery_profile_update();

-- 2. Linking, hardened:
--    - optionally scoped to one artist (education saves don't sweep the table)
--    - only education-like partner types can claim alumni
--    - deterministic on name collisions (earliest verified wins)
CREATE OR REPLACE FUNCTION link_education_partners(p_artist_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE artist_education e
  SET partner_id = match.id
  FROM LATERAL (
    SELECT g.id
    FROM gallery_profiles g
    WHERE g.is_verified = TRUE
      AND g.partner_type IN ('school', 'museum', 'artist_residency')
      AND lower(trim(g.gallery_name)) = lower(trim(e.institution))
    ORDER BY g.verified_at NULLS LAST, g.created_at
    LIMIT 1
  ) match
  WHERE e.partner_id IS NULL
    AND (p_artist_id IS NULL OR e.artist_id = p_artist_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION link_education_partners(UUID) TO authenticated;

-- 3. Indexes for the join and the partner-profile alumni lookup.
CREATE INDEX IF NOT EXISTS idx_artist_education_partner ON artist_education (partner_id);
CREATE INDEX IF NOT EXISTS idx_gallery_profiles_name_lower
  ON gallery_profiles (lower(trim(gallery_name))) WHERE is_verified;
