import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { commissionQuoteSchema } from '@/schemas/commissionSchema';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate.body, { status: gate.status });

  const { data: commission } = await supabase
    .from('commissions')
    .select('artist_id, conversation_id')
    .eq('id', params.id)
    .single();

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', commission.artist_id)
    .single();

  if (artist?.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const parsed = commissionQuoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('commissions')
    .update({ status: 'quoted', ...parsed.data })
    .eq('id', params.id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Only new requests can be quoted.' }, { status: 409 });

  // Post the quote into the linked thread as an accept/decline card.
  if (commission.conversation_id) {
    const { data: msg } = await admin
      .from('messages')
      .insert({
        conversation_id: commission.conversation_id,
        sender_id: user.id,
        content: 'Sent a commission quote',
        message_type: 'quote_card',
      })
      .select('id')
      .single();
    if (msg) {
      // The card is a copy of the ROW just written, not of the request body:
      // after 00056 only the platform can post a quote_card and only the
      // platform can rewrite its metadata, so what the buyer accepts is what
      // /confirm moves the commission forward at (01-r2 P2).
      await admin.from('message_attachments').insert({
        message_id: msg.id,
        attachment_type: 'quote_card',
        url: null,
        metadata: {
          commission_id: params.id,
          quoted_price_cents: data.quoted_price_cents,
          estimated_completion: data.estimated_completion,
          artist_notes: data.artist_notes,
        },
      });
      await admin
        .from('conversations')
        .update({ last_message_text: '💬 Commission quote', last_message_at: new Date().toISOString() })
        .eq('id', commission.conversation_id);
    }
  }

  return NextResponse.json(data);
}
