-- Phase 9: idempotent onboarding email drip log.
CREATE TABLE drip_emails_sent (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, stage)
);
ALTER TABLE drip_emails_sent ENABLE ROW LEVEL SECURITY;
-- Service-role only (cron); no policies = no client access.
