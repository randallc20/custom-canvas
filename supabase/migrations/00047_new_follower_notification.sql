-- P5 (hardening plan): the 'new_follower' notification type has existed since
-- 00017's constraint, and both icon maps knew it — but nothing ever created
-- one. A trigger on follows (mirroring notify_followers_new_listing) fires
-- regardless of which client writes the row.

CREATE OR REPLACE FUNCTION notify_artist_new_follower()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  artist_user UUID;
  follower_name TEXT;
  follower_link TEXT;
  notif_body TEXT;
BEGIN
  SELECT profile_id INTO artist_user FROM artist_profiles WHERE id = NEW.artist_id;
  IF artist_user IS NULL OR artist_user = NEW.follower_id THEN RETURN NEW; END IF;

  SELECT full_name INTO follower_name FROM profiles WHERE id = NEW.follower_id;
  notif_body := coalesce(nullif(trim(follower_name), ''), 'Someone') || ' started following you.';

  -- Link to the follower's public surface when they have one (a live artist
  -- or a partner); plain buyers have no public page, so no link.
  SELECT '/artist/' || slug INTO follower_link
    FROM artist_profiles WHERE profile_id = NEW.follower_id AND is_live;
  IF follower_link IS NULL THEN
    SELECT '/gallery/' || slug INTO follower_link
      FROM gallery_profiles WHERE profile_id = NEW.follower_id;
  END IF;

  -- Dedupe rapid follow/unfollow churn: at most one notification per
  -- follower per artist per day. The body carries the follower's name, so
  -- (user_id, type, body, 24h) identifies the pair well enough.
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE user_id = artist_user
      AND type = 'new_follower'
      AND body = notif_body
      AND created_at > now() - interval '24 hours'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (artist_user, 'new_follower', 'New follower', notif_body, follower_link);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_notify_artist ON follows;
CREATE TRIGGER follows_notify_artist AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_artist_new_follower();
