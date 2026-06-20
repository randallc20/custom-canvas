import { supabase } from '@/lib/supabase';
import { Message, MessageAttachment } from '@/types/message';
import { updateLastMessage } from './conversations';

interface MessageParams {
  cursor?: string;
  limit?: number;
}

interface MessageResult {
  messages: Message[];
  nextCursor: string | null;
}

export async function getMessages(conversationId: string, params: MessageParams = {}): Promise<MessageResult> {
  const { cursor, limit = 50 } = params;

  let query = supabase
    .from('messages')
    .select('*, attachments:message_attachments(*)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const messages = (hasMore ? data.slice(0, limit) : data) as Message[];
  const nextCursor = hasMore ? messages[messages.length - 1].created_at : null;

  return { messages, nextCursor };
}

export async function sendMessage(data: {
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: string;
  attachment?: {
    attachment_type: string;
    url: string | null;
    metadata?: Record<string, unknown>;
  };
}): Promise<Message> {
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      content: data.content,
      message_type: data.message_type ?? 'text',
    })
    .select()
    .single();

  if (error) throw error;

  if (data.attachment) {
    const { error: attErr } = await supabase.from('message_attachments').insert({
      message_id: message.id,
      attachment_type: data.attachment.attachment_type,
      url: data.attachment.url,
      metadata: data.attachment.metadata ?? {},
    });
    if (attErr) throw attErr;
  }

  // Give media/card messages a readable conversation-list preview.
  const preview = data.content?.trim()
    ? data.content
    : data.message_type === 'image' ? '📷 Photo'
    : data.message_type === 'quote_card' ? '💬 Commission quote'
    : data.message_type === 'listing_card' ? '🖼 Shared a listing'
    : data.attachment?.attachment_type === 'file' ? '📎 Attachment'
    : '';
  await updateLastMessage(data.conversation_id, preview);
  return message;
}

export async function markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

export async function getUnreadCounts(userId: string, conversationIds: string[]): Promise<Record<string, number>> {
  if (conversationIds.length === 0) return {};

  const { data, error } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', conversationIds)
    .neq('sender_id', userId)
    .eq('is_read', false);

  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1;
  }
  return counts;
}

export async function getAttachments(messageId: string): Promise<MessageAttachment[]> {
  const { data, error } = await supabase
    .from('message_attachments')
    .select('*')
    .eq('message_id', messageId);

  if (error) throw error;
  return data;
}
