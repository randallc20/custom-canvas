-- Enforce blocking at the DB layer (the anon client can insert messages
-- directly, so a service-only check would be bypassable), and allow the new
-- commission_update notification type.

DROP POLICY IF EXISTS "Participants can send messages" ON messages;
CREATE POLICY "Participants can send messages" ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE participant_one = auth.uid() OR participant_two = auth.uid()
    )
    -- Cannot send to a conversation whose other participant has blocked you.
    AND NOT EXISTS (
      SELECT 1 FROM conversations c
      JOIN blocked_users b ON b.blocked_id = auth.uid()
      WHERE c.id = conversation_id
        AND b.blocker_id = CASE WHEN c.participant_one = auth.uid()
                                THEN c.participant_two ELSE c.participant_one END
    )
  );

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'new_message', 'new_follower', 'new_order', 'commission_request',
  'commission_accepted', 'commission_declined', 'commission_completed',
  'commission_confirmed', 'commission_disputed', 'commission_update',
  'review_received', 'listing_reported', 'payout_sent'
]));
