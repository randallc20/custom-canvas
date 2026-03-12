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
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const messages = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore ? messages[messages.length - 1].created_at : null;

  return { messages, nextCursor };
}

export async function sendMessage(data: {
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: string;
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

  await updateLastMessage(data.conversation_id, data.content);
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

export async function getAttachments(messageId: string): Promise<MessageAttachment[]> {
  const { data, error } = await supabase
    .from('message_attachments')
    .select('*')
    .eq('message_id', messageId);

  if (error) throw error;
  return data;
}
