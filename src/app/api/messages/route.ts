import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendNewMessageEmail } from '@/services/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Real user message types worth emailing about (system/mirror messages are not).
const EMAILABLE = new Set(['text', 'image', 'listing_card', 'quote_card']);

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversation_id, content, message_type = 'text', attachment } = await request.json();
  if (!conversation_id) return NextResponse.json({ error: 'Missing conversation' }, { status: 400 });

  // Insert with the caller's session so RLS applies (participant-only, and the
  // blocked-sender guard trigger still fires).
  const { data: message, error } = await supabase
    .from('messages')
    .insert({ conversation_id, sender_id: user.id, content: content ?? '', message_type })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (attachment) {
    const { error: attErr } = await supabase.from('message_attachments').insert({
      message_id: message.id,
      attachment_type: attachment.attachment_type,
      url: attachment.url,
      metadata: attachment.metadata ?? {},
    });
    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });
  }

  const preview =
    (content ?? '').trim() ? content
    : message_type === 'image' ? '📷 Photo'
    : message_type === 'quote_card' ? '💬 Commission quote'
    : message_type === 'listing_card' ? '🖼 Shared a listing'
    : attachment?.attachment_type === 'file' ? '📎 Attachment'
    : '';
  await supabase
    .from('conversations')
    .update({ last_message_text: preview, last_message_at: new Date().toISOString() })
    .eq('id', conversation_id);

  // Email the recipient — best-effort, never fails the send. Respects their
  // "New message emails" toggle, muting, and only fires on the FIRST unread so
  // an active back-and-forth doesn't spam (matches the away-and-got-a-message
  // pattern). Re-fires once they've read and a new message arrives.
  if (EMAILABLE.has(message_type)) {
    fanOutMessageEmail(conversation_id, user.id, preview).catch((e) => Sentry.captureException(e));
  }

  return NextResponse.json(message);
}

async function fanOutMessageEmail(conversationId: string, senderId: string, preview: string) {
  const admin = createAdminSupabaseClient();

  const { data: conv } = await admin
    .from('conversations')
    .select('participant_one, participant_two')
    .eq('id', conversationId)
    .single();
  if (!conv) return;
  const recipientId = conv.participant_one === senderId ? conv.participant_two : conv.participant_one;
  if (!recipientId) return;

  // Only the first unread triggers an email.
  const { count: unread } = await admin
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', recipientId)
    .eq('is_read', false);
  if ((unread ?? 0) !== 1) return;

  // Recipient muted this thread? Don't email.
  const { data: muted } = await admin
    .from('muted_conversations')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', recipientId)
    .maybeSingle();
  if (muted) return;

  const [{ data: recipient }, { data: sender }] = await Promise.all([
    admin.from('profiles').select('email, email_preferences').eq('id', recipientId).single(),
    admin.from('profiles').select('full_name').eq('id', senderId).single(),
  ]);
  if (!recipient?.email) return;
  const prefs = recipient.email_preferences as { message_notifications?: boolean } | null;
  if (prefs?.message_notifications === false) return;

  await sendNewMessageEmail(
    recipient.email,
    sender?.full_name ?? 'Someone',
    preview || 'sent you a message',
    `${APP_URL}/messages/${conversationId}`
  );
}
