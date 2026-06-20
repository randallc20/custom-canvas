-- Phase 6: chat safety + commission progress updates.

-- Block: blocked users can't message the blocker; their threads hide. The
-- blocked party is never notified.
CREATE TABLE blocked_users (
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own blocks" ON blocked_users FOR ALL
  USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- Mute: muted threads suppress notifications + unread badge; the other party
-- never knows.
CREATE TABLE muted_conversations (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, conversation_id)
);
ALTER TABLE muted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mutes" ON muted_conversations FOR ALL
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- Commission progress updates: append-only record artists post during the
-- deposit_paid/in-progress phase. Double as the work record in disputes.
CREATE TABLE commission_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id UUID NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  photo_url TEXT,
  progress_percent INT CHECK (progress_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE commission_updates ENABLE ROW LEVEL SECURITY;

-- Visible to the two parties on the commission.
CREATE POLICY "Commission parties view updates" ON commission_updates FOR SELECT
  USING (
    commission_id IN (
      SELECT c.id FROM commissions c
      WHERE c.requester_id = auth.uid()
        OR c.artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
    )
  );

-- Only the commission's artist can post; append-only (no update/delete policy).
CREATE POLICY "Artist posts commission updates" ON commission_updates FOR INSERT
  WITH CHECK (
    artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
    AND commission_id IN (
      SELECT id FROM commissions
      WHERE artist_id IN (SELECT id FROM artist_profiles WHERE profile_id = auth.uid())
    )
  );

CREATE INDEX commission_updates_commission_idx ON commission_updates (commission_id, created_at DESC);
-- Last-nudge tracking for the stale-commission cron (max one per 14 days).
ALTER TABLE commissions ADD COLUMN last_nudge_at TIMESTAMPTZ;

-- Reports: extend the listing-only table to cover user and message reports.
ALTER TABLE reports ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE reports ADD COLUMN reported_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE reports ADD COLUMN reported_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;
