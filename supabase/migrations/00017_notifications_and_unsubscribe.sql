-- Phase 7: follower + price-drop in-app notifications (via triggers, so they
-- fire regardless of which client writes the listing) + unsubscribe token.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent',
  'new_listing', 'price_drop'
]));

-- Per-user token for one-click email unsubscribe (CAN-SPAM) without a session.
ALTER TABLE profiles ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

-- New listing published -> notify followers in-app.
CREATE OR REPLACE FUNCTION notify_followers_new_listing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  artist_name TEXT;
BEGIN
  IF NEW.status <> 'available' THEN RETURN NEW; END IF;
  SELECT display_name INTO artist_name FROM artist_profiles WHERE id = NEW.artist_id;
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT f.follower_id, 'new_listing', 'New work',
         coalesce(artist_name, 'An artist') || ' just listed "' || NEW.title || '".',
         '/listing/' || NEW.id
  FROM follows f WHERE f.artist_id = NEW.artist_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_notify_followers ON listings;
CREATE TRIGGER listings_notify_followers AFTER INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION notify_followers_new_listing();

-- Price drop -> notify savers (debounced to once per 24h per listing).
CREATE OR REPLACE FUNCTION notify_savers_price_drop()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.price_cents >= OLD.price_cents THEN RETURN NEW; END IF;
  IF OLD.last_price_drop_alert_at IS NOT NULL
     AND OLD.last_price_drop_alert_at > now() - interval '24 hours' THEN
    RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, type, title, body, link)
  SELECT s.profile_id, 'price_drop', 'Price drop',
         '"' || NEW.title || '" is now $' || to_char(NEW.price_cents / 100.0, 'FM999990.00')
           || ' (was $' || to_char(OLD.price_cents / 100.0, 'FM999990.00') || ').',
         '/listing/' || NEW.id
  FROM saved_listings s WHERE s.listing_id = NEW.id;
  NEW.last_price_drop_alert_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_notify_price_drop ON listings;
CREATE TRIGGER listings_notify_price_drop BEFORE UPDATE OF price_cents ON listings
  FOR EACH ROW EXECUTE FUNCTION notify_savers_price_drop();
