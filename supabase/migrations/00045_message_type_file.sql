-- The chat composer offers PDF/file attachments (message_type 'file' with the
-- filename as content — MessageBubble renders it, MessageInput sends it), but
-- the 00001 CHECK constraint never included 'file', so every file attachment
-- has failed with a constraint violation since launch — silently, because the
-- composer's catch swallows the error. Allow the type the app already sends.

ALTER TABLE messages DROP CONSTRAINT messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'file', 'listing_card', 'quote_card', 'system'));
