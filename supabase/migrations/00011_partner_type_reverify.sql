-- A verified partner could switch partner_type (e.g. gallery -> school) and
-- immediately claim alumni education links without re-approval. Treat a
-- type change like a name change: reset verification and sever links.
CREATE OR REPLACE FUNCTION guard_gallery_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR auth.uid() IS NULL INTO is_admin;

  IF NOT is_admin THEN
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by THEN
      RAISE EXCEPTION 'verification status can only be changed by an admin';
    END IF;

    IF (NEW.gallery_name IS DISTINCT FROM OLD.gallery_name
        OR NEW.partner_type IS DISTINCT FROM OLD.partner_type) AND OLD.is_verified THEN
      NEW.is_verified := FALSE;
      NEW.verified_at := NULL;
      NEW.verified_by := NULL;
      UPDATE artist_education SET partner_id = NULL WHERE partner_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
