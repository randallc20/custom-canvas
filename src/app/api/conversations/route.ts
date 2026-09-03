import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PUBLIC_PROFILE_COLS } from '@/lib/publicProfile';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('conversations')
    .select(`*, participant_one_profile:profiles!conversations_participant_one_fkey(${PUBLIC_PROFILE_COLS}), participant_two_profile:profiles!conversations_participant_two_fkey(${PUBLIC_PROFILE_COLS})`)
    .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
