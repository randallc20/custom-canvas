import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendNewMessageEmail } from '@/services/email';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// The types a PARTICIPANT may post. `system` (the platform's own notices —
// pickup coordination, progress mirrors) and `quote_card` (a commission
// quote, posted by the accept route from the row it just wrote) are
// platform-only: guard_messages_insert / guard_message_attachments_insert
// (00056) refuse them under a user session, and this mirror of the allowlist
// turns that into a 400 instead of a raw constraint error (01-r2 P2).
const PARTICIPANT_MESSAGE_TYPES = ['text', 'image', 'file', 'listing_card'] as const;
const PARTICIPANT_ATTACHMENT_TYPES = ['image', 'file', 'listing_card'] as const;

const messageBodySchema = z.object({
  conversation_id: z.string().uuid(),
  content: z.string().optional(),
  message_type: z.enum(PARTICIPANT_MESSAGE_TYPES).default('text'),
  attachment: z
    .object({
      attachment_type: z.enum(PARTICIPANT_ATTACHMENT_TYPES),
      url: z.string().nullable().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

// Real user message types worth emailing about (system/mirror messages are not).
// 'file' is what ChatThread sends for a PDF/document attachment (00045) — a
// brief sent as the first message must email the artist like a photo does.
const EMAILABLE = new Set<string>(PARTICIPANT_MESSAGE_TYPES);

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate, { status: 403 });

  const parsed = messageBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { conversation_id, content, message_type, attachment } = parsed.data;

  // Insert with the caller's session so RLS applies (participant-only, and the
  // blocked-sender guard trigger still fires).
  const { data: message, error } = await supabase
    .from('messages')
    .insert({ conversation_id, sender_id: user.id, content: content ?? '', message_type })
    .select()
    .single();
  if (error) {
    // 42501 = the RLS refusal — in practice the blocked-sender guard (or a
    // non-participant). Expected behavior, not an incident: return a clean,
    // deliberately vague 403 (blocking is quiet by design) instead of the raw
    // policy text, so the client can toast without paging Sentry every time
    // the nightly suite walks the block test.
    if (error.code === '42501') {
      return NextResponse.json({ error: "This message couldn't be sent." }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (attachment) {
    const { error: attErr } = await supabase.from('message_attachments').insert({
      message_id: message.id,
      attachment_type: attachment.attachment_type,
      url: attachment.url,
      metadata: attachment.metadata ?? {},
    });
    if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });
  }

  const text = content ?? '';
  const preview =
    text.trim() ? text
    : message_type === 'image' ? '📷 Photo'
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
