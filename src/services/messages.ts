import { supabase } from '@/lib/supabase';
import { announceAcceptanceRequired } from '@/services/acceptance';
import { Message } from '@/types/message';

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

/** A 403 from the send endpoint: the write was REFUSED by policy (blocked
 *  sender / non-participant / a stale acceptance) — expected behavior, worth
 *  a toast but never a Sentry event. `code` carries the machine-readable
 *  reason where the route sends one. */
export class MessageRefusedError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'MessageRefusedError';
    this.code = code;
  }
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
  // Goes through the API so the server can email the recipient (respecting
  // their "New message emails" toggle). RLS + block-guard still apply because
  // the route inserts with the caller's session. The conversation-list preview
  // and last-message stamp are set server-side too.
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: data.conversation_id,
      content: data.content,
      message_type: data.message_type ?? 'text',
      attachment: data.attachment,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = typeof body.error === 'string' ? body.error : 'Failed to send message';
    if (res.status === 403) {
      // An acceptance refusal is actionable, and the person cannot act on it
      // unless something tells them: bring the interstitial back.
      if (body.code === 'acceptance_required') announceAcceptanceRequired();
      throw new MessageRefusedError(msg, body.code);
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
  // Zero rows is legitimate here (nothing unread) — no row assertion.
  const { error } = await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

/** Unread count per conversation for the signed-in user, counted in the
 *  database (my_unread_counts, 00051). The previous shape put every
 *  conversation id in the query string and downloaded one row per unread
 *  message to count them client-side. */
export async function getUnreadCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('my_unread_counts');
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { conversation_id: string; unread: number }[]) {
    counts[row.conversation_id] = Number(row.unread);
  }
  return counts;
}
