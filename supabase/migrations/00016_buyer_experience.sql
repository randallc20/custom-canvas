-- Phase 7: buyer experience & operations.

-- Review reminders (cron stamps this once a request goes out).
ALTER TABLE orders ADD COLUMN review_requested_at TIMESTAMPTZ;

-- Compliance + email preferences. Purchase/payout emails always send; these
-- gate the optional categories.
ALTER TABLE profiles ADD COLUMN accepted_terms_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN email_preferences JSONB NOT NULL DEFAULT
  '{"marketing":true,"new_listing_alerts":true,"message_notifications":true,"price_drop_alerts":true}'::jsonb;

-- Artist "away mode".
ALTER TABLE artist_profiles ADD COLUMN away_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE artist_profiles ADD COLUMN away_message TEXT;
ALTER TABLE artist_profiles ADD COLUMN away_until DATE;
-- Remember commission availability so it can be restored when away ends.
ALTER TABLE artist_profiles ADD COLUMN commissions_open_before_away BOOLEAN;
-- Debounce: max one new-listing alert blast per artist per hour.
ALTER TABLE artist_profiles ADD COLUMN last_listing_alert_at TIMESTAMPTZ;

-- Debounce: max one price-drop alert per listing per 24h.
ALTER TABLE listings ADD COLUMN last_price_drop_alert_at TIMESTAMPTZ;

-- Away auto-reply: one automatic system reply per thread while away.
ALTER TABLE conversations ADD COLUMN away_autoreplied BOOLEAN NOT NULL DEFAULT FALSE;
