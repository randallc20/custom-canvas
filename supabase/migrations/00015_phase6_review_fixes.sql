-- Phase 6 review fix: a conversation participant could attach files to the
-- OTHER party's message (policy only checked conversation membership, not
-- message ownership), spoofing content attributed to them.
DROP POLICY IF EXISTS "Participants can add attachments" ON message_attachments;
CREATE POLICY "Senders can add attachments" ON message_attachments FOR INSERT
  WITH CHECK (
    message_id IN (SELECT id FROM messages WHERE sender_id = auth.uid())
  );
