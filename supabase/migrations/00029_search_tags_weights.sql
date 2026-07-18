-- Search fix (feedback 2026-07-17): tag words (style/subject/mood — what
-- buyers actually type) were invisible to search, and the vector had no
-- field weighting. Rebuild the listing vector as title(A) + medium/tags(B)
-- + description(C), and keep it fresh when tags attach/detach.

-- Same function name the 00001 trigger already calls — body swap only.
CREATE OR REPLACE FUNCTION listings_search_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.medium, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE((
      SELECT string_agg(t.name, ' ')
      FROM listing_tags lt JOIN tags t ON t.id = lt.tag_id
      WHERE lt.listing_id = NEW.id
    ), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$;

-- Tag attach/detach: touch the listing so its BEFORE trigger recomputes.
CREATE OR REPLACE FUNCTION listing_tags_touch_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE listings SET updated_at = now()
  WHERE id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS listing_tags_search_refresh ON listing_tags;
CREATE TRIGGER listing_tags_search_refresh AFTER INSERT OR DELETE ON listing_tags
  FOR EACH ROW EXECUTE FUNCTION listing_tags_touch_listing();

-- Backfill every existing vector (suspend the updated_at touch so the
-- catalog's timestamps don't all shift).
ALTER TABLE listings DISABLE TRIGGER listings_updated_at;
UPDATE listings SET search_vector = NULL;
ALTER TABLE listings ENABLE TRIGGER listings_updated_at;
