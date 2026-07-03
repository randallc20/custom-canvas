-- Build 3 Phase 3: email-channel claim stamps for listing alerts.
--
-- NOTE: the in-app follower notification (followers_notified_at column +
-- notify_followers_new_listing firing once per listing on INSERT or
-- draft->available publish) already exists — migration 00022. This migration
-- only adds what the email fan-out needs:
--   1. claim stamps the API routes atomically claim (conditional UPDATE via
--      service role) before fanning out, so concurrent publish/price-drop
--      requests can't double-blast followers or savers;
--   2. a guard so artists can't set or reset any alert stamp themselves.

ALTER TABLE listings ADD COLUMN publish_email_sent_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN price_drop_email_sent_at TIMESTAMPTZ;

-- Backfill: anything already out of draft was published pre-email-era and
-- must never trigger a "just listed" blast. Suspend the updated_at touch
-- trigger so the backfill doesn't reshuffle updated_at across the catalog.
ALTER TABLE listings DISABLE TRIGGER listings_updated_at;
UPDATE listings SET publish_email_sent_at = created_at WHERE status <> 'draft';
ALTER TABLE listings ENABLE TRIGGER listings_updated_at;

-- Alert stamps are system-owned. Named to sort before the notify triggers
-- (BEFORE triggers fire alphabetically), so notify_followers_new_listing can
-- still set followers_notified_at in the same statement after this runs.
CREATE OR REPLACE FUNCTION guard_listing_alert_stamps()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    IF TG_OP = 'INSERT' THEN
      -- Pre-set stamps on INSERT would suppress notifications forever.
      NEW.followers_notified_at := NULL;
      NEW.publish_email_sent_at := NULL;
      NEW.price_drop_email_sent_at := NULL;
      NEW.last_price_drop_alert_at := NULL;
    ELSE
      NEW.followers_notified_at := OLD.followers_notified_at;
      NEW.publish_email_sent_at := OLD.publish_email_sent_at;
      NEW.price_drop_email_sent_at := OLD.price_drop_email_sent_at;
      NEW.last_price_drop_alert_at := OLD.last_price_drop_alert_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS listings_alert_stamps_guard ON listings;
CREATE TRIGGER listings_alert_stamps_guard BEFORE INSERT OR UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION guard_listing_alert_stamps();
