import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { sendMessageSchema } from '@/schemas/messageSchema';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cursor = request.nextUrl.searchParams.get('cursor');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '50', 10);

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', params.id)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore = (data?.length ?? 0) > limit;
  const messages = hasMore ? data!.slice(0, limit) : data ?? [];
  const nextCursor = hasMore ? messages[messages.length - 1].created_at : null;

  return NextResponse.json({ messages, nextCursor });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = sendMessageSchema.safeParse({ ...body, conversation_id: params.id });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: params.id,
      sender_id: user.id,
      content: parsed.data.content,
      message_type: parsed.data.message_type,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from('conversations')
    .update({ last_message_text: parsed.data.content, last_message_at: new Date().toISOString() })
    .eq('id', params.id);

  return NextResponse.json(message, { status: 201 });
}
