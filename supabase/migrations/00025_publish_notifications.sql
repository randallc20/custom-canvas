-- Build 3 Phase 3: follower notifications fire exactly once per listing,
-- including when a draft is published later (the old trigger was AFTER INSERT
-- only, so draft -> available never notified anyone). The stamp is shared by
-- the in-app trigger and the server-side email fan-out so the two channels
-- can't diverge.
ALTER TABLE listings ADD COLUMN followers_notified_at TIMESTAMPTZ;

-- Backfill: anything that ever left draft already had its INSERT-time
-- notification (or predates the feature) — never re-notify.
UPDATE listings SET followers_notified_at = created_at WHERE status <> 'draft';

CREATE OR REPLACE FUNCTION notify_followers_new_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  artist_name TEXT;
BEGIN
  IF NEW.status <> 'available' THEN RETURN NEW; END IF;
  IF NEW.followers_notified_at IS NOT NULL THEN RETURN NEW; END IF;
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

-- Email-channel claim stamps: the API routes atomically claim these
-- (conditional UPDATE via service role) before fanning out, so concurrent
-- publish/price-drop requests can't double-blast followers or savers.
ALTER TABLE listings ADD COLUMN publish_email_sent_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN price_drop_email_sent_at TIMESTAMPTZ;
UPDATE listings SET publish_email_sent_at = created_at WHERE status <> 'draft';

-- Artists must not be able to reset alert stamps (re-blasting followers by
-- clearing them via the client SDK). Named to sort before the notify
-- triggers so those can still set stamps in the same statement.
CREATE OR REPLACE FUNCTION guard_listing_alert_stamps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.followers_notified_at := OLD.followers_notified_at;
    NEW.publish_email_sent_at := OLD.publish_email_sent_at;
    NEW.price_drop_email_sent_at := OLD.price_drop_email_sent_at;
    NEW.last_price_drop_alert_at := OLD.last_price_drop_alert_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_alert_stamps_guard ON listings;
CREATE TRIGGER listings_alert_stamps_guard BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION guard_listing_alert_stamps();
