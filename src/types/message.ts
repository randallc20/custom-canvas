export type MessageType = 'text' | 'image' | 'listing_card' | 'quote_card' | 'system';
export type AttachmentType = 'image' | 'file' | 'listing_card' | 'quote_card';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  is_read: boolean;
  created_at: string;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  id: string;
  message_id: string;
  attachment_type: AttachmentType;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
