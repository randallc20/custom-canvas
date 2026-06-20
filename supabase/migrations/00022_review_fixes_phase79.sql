-- Phase 7-9 review fixes.

-- 1. Reliable delivered-at for the review-reminder cron (updated_at resets on
-- every row update, so it can't proxy delivery time).
ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
CREATE OR REPLACE FUNCTION set_order_delivered_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_set_delivered_at ON orders;
CREATE TRIGGER orders_set_delivered_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_delivered_at();

-- 2. Follower new-listing alert: fire once per listing, on first publish —
-- whether that's an INSERT (status=available) or a draft->available UPDATE.
-- (Previously AFTER INSERT only, so draft-first listings never notified, and
-- there was no once-only guard.)
ALTER TABLE listings ADD COLUMN followers_notified_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION notify_followers_new_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  artist_name TEXT;
BEGIN
  IF NEW.status <> 'available' OR NEW.followers_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'available' THEN
    RETURN NEW;
  END IF;
  SELECT display_name INTO artist_name FROM artist_profiles WHERE id = NEW.artist_id;
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT f.follower_id, 'new_listing', 'New work',
         coalesce(artist_name, 'An artist') || ' just listed "' || NEW.title || '".',
         '/listing/' || NEW.id
  FROM follows f WHERE f.artist_id = NEW.artist_id;
  NEW.followers_notified_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listings_notify_followers ON listings;
CREATE TRIGGER listings_notify_followers BEFORE INSERT OR UPDATE OF status ON listings
  FOR EACH ROW EXECUTE FUNCTION notify_followers_new_listing();
