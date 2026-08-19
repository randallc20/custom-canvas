-- Submit-for-review flow (product decision 2026-08-18): artists no longer
-- enter the review queue the moment they sign up. They start in 'draft',
-- build their shop (profile, listings, Stripe KYC — all hidden), and press
-- "Submit for review" when ready. Only then do they appear in the admin
-- queue. Rejected artists resubmit through the same transition.
--
-- Lifecycle: draft → pending → approved
--                     ↑          (is_live flips true on approval)
--                  rejected ─┘ (resubmit)

ALTER TABLE artist_profiles DROP CONSTRAINT IF EXISTS artist_profiles_application_status_check;
ALTER TABLE artist_profiles ADD CONSTRAINT artist_profiles_application_status_check
  CHECK (application_status IN ('draft', 'pending', 'approved', 'rejected'));

-- Nobody has genuinely submitted anything yet (the queue predates any real
-- signup), so rows that 00030 defaulted to 'pending' move back to 'draft'.
-- Approved/rejected rows keep their state.
UPDATE artist_profiles SET application_status = 'draft' WHERE application_status = 'pending';

ALTER TABLE artist_profiles ALTER COLUMN application_status SET DEFAULT 'draft';

-- INSERT guard now forces 'draft' (was 'pending').
CREATE OR REPLACE FUNCTION guard_artist_profiles_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_privileged() THEN
    NEW.is_live := false;
    NEW.application_status := 'draft';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.is_houston_verified := false;
    NEW.is_featured := false;
  END IF;
  RETURN NEW;
END;
$$;

-- Admin notification fires only on transitions INTO 'pending' (a submission),
-- never on signup — the queue holds finished shops, not empty accounts.
CREATE OR REPLACE FUNCTION notify_admins_new_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.application_status = 'pending'
     AND TG_OP = 'UPDATE'
     AND OLD.application_status IS DISTINCT FROM 'pending' THEN
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    SELECT p.id, 'artist_application',
           'New artist application',
           COALESCE(NEW.display_name, 'An artist') || ' submitted their shop for review.',
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
