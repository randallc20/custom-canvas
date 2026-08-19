import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PUBLIC_PROFILE_COLS } from '@/lib/publicProfile';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('conversations')
    .select(`*, participant_one_profile:profiles!conversations_participant_one_fkey(${PUBLIC_PROFILE_COLS}), participant_two_profile:profiles!conversations_participant_two_fkey(${PUBLIC_PROFILE_COLS})`)
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (data.participant_one !== user.id && data.participant_two !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(data);
}
