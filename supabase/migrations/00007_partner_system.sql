-- Phase 4: gallery -> 8 partner types. Table keeps its name (gallery_profiles);
-- "Partner" is the product-facing term in UI copy and TS aliases.

CREATE TYPE partner_type_enum AS ENUM ('gallery', 'museum', 'school', 'business',
  'interior_design', 'artist_residency', 'corporate', 'community_org');

ALTER TABLE gallery_profiles ADD COLUMN partner_type partner_type_enum
  NOT NULL DEFAULT 'gallery';

ALTER TABLE artist_education ADD COLUMN partner_id UUID
  REFERENCES gallery_profiles(id) ON DELETE SET NULL;

-- Matches education entries to verified partners by institution name.
-- SECURITY DEFINER because education rows are RLS-restricted to their artist,
-- but the link is set by the system (on partner verification or education save).
CREATE OR REPLACE FUNCTION link_education_partners()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE artist_education e
  SET partner_id = g.id
  FROM gallery_profiles g
  WHERE e.partner_id IS NULL
    AND g.is_verified = TRUE
    AND lower(trim(e.institution)) = lower(trim(g.gallery_name));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION link_education_partners() TO authenticated;
