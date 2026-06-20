import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { commissionQuoteSchema } from '@/schemas/commissionSchema';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
      await admin.from('message_attachments').insert({
        message_id: msg.id,
        attachment_type: 'quote_card',
        url: null,
        metadata: { commission_id: params.id, ...parsed.data },
      });
      await admin
        .from('conversations')
        .update({ last_message_text: '💬 Commission quote', last_message_at: new Date().toISOString() })
        .eq('id', commission.conversation_id);
    }
  }

  return NextResponse.json(data);
}
