import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createConversationSchema } from '@/schemas/messageSchema';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('conversations')
    .select('*, participant_one_profile:profiles!conversations_participant_one_fkey(*), participant_two_profile:profiles!conversations_participant_two_fkey(*)')
    .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { participant_id, context_type, context_id, initial_message } = parsed.data;

  // Approval gate: a non-live artist can't be messaged (their page is
  // unreachable; this closes the direct-profile-id path). Buyers have no
  // artist_profiles row, so this only bites draft/pending/rejected artists.
  const { data: targetArtist } = await supabase
    .from('artist_profiles')
    .select('is_live')
    .eq('profile_id', participant_id)
    .maybeSingle();
  if (targetArtist && !targetArtist.is_live) {
    return NextResponse.json({ error: 'User not available' }, { status: 404 });
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      participant_one: user.id,
      participant_two: participant_id,
      context_type: context_type ?? null,
      context_id: context_id ?? null,
      last_message_text: initial_message,
      last_message_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (convError) return NextResponse.json({ error: convError.message }, { status: 500 });

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender_id: user.id,
    content: initial_message,
    message_type: 'text',
  });

  return NextResponse.json(conversation, { status: 201 });
}
