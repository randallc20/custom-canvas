-- Artist platform-approval gate. A self-serve artist signs up and can build
-- their profile + listings, but stays invisible (is_live=false) until an admin
-- reviews and approves them. This is distinct from Local Verified, which is a
-- trust BADGE on an already-live artist (is_houston_verified) — approval is the
-- gate to being on the platform at all.

-- Application lifecycle. is_live stays the runtime visibility flag every public
-- surface already filters on; application_status records where the artist is in
-- review and lets a rejected artist fix things and resubmit.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS application_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (application_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Backfill: anyone already live was implicitly approved (demo/seed data + any
-- artist who was made live before this gate existed). Anyone dark stays pending.
UPDATE artist_profiles
  SET application_status = 'approved', reviewed_at = COALESCE(reviewed_at, now())
  WHERE is_live = true;

-- Freeze the approval columns for non-privileged callers, extending the existing
-- guard (00009). Without this an artist could self-approve by setting is_live /
-- application_status on their own profile UPDATE — the whole gate would be moot.
CREATE OR REPLACE FUNCTION guard_artist_profiles_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_houston_verified := OLD.is_houston_verified;
    NEW.is_featured := OLD.is_featured;
    NEW.completeness_score := OLD.completeness_score;
    NEW.stripe_onboarded := OLD.stripe_onboarded;
    NEW.stripe_account_id := OLD.stripe_account_id;
    NEW.is_live := OLD.is_live;
    NEW.application_status := OLD.application_status;
    NEW.reviewed_by := OLD.reviewed_by;
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END;
$$;

-- Onboarding inserts the profile directly under RLS, and BEFORE UPDATE guards
-- don't cover INSERT — so force a clean pending application at creation time for
-- non-privileged callers (nobody seeds themselves live/approved on insert).
CREATE OR REPLACE FUNCTION guard_artist_profiles_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_live := false;
    NEW.application_status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.is_houston_verified := false;
    NEW.is_featured := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS artist_profiles_insert_guard ON artist_profiles;
CREATE TRIGGER artist_profiles_insert_guard BEFORE INSERT ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION guard_artist_profiles_insert();

-- Notify every admin when an application lands or is resubmitted (SECURITY
-- DEFINER so it can write notifications rows for other users, mirroring the
-- follower/price-drop notification triggers).
CREATE OR REPLACE FUNCTION notify_admins_new_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.application_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.application_status IS DISTINCT FROM 'pending') THEN
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    SELECT p.id, 'artist_application',
           'New artist application',
           COALESCE(NEW.display_name, 'An artist') || ' is awaiting review.',
           '/admin/applications', false
    FROM profiles p WHERE p.role = 'admin';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS artist_application_notify ON artist_profiles;
CREATE TRIGGER artist_application_notify
  AFTER INSERT OR UPDATE OF application_status ON artist_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_admins_new_application();

-- Queue lookups: pending applications, oldest first.
CREATE INDEX IF NOT EXISTS artist_profiles_application_status_idx
  ON artist_profiles (application_status);

-- New notification types for the approval lifecycle.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent',
  'new_listing', 'price_drop', 'houston_verified', 'refund_approved',
  'artist_application', 'artist_approved', 'artist_rejected'
]));
