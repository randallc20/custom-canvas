import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: commission } = await supabase
    .from('commissions')
    .select('requester_id')
    .eq('id', params.id)
    .single();

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (commission.requester_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { reason } = await request.json();
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) {
    return NextResponse.json({ error: 'Please describe the issue (up to 2000 characters).' }, { status: 400 });
  }

  const { data, error } = await createAdminSupabaseClient()
    .from('commissions')
    .update({ status: 'disputed', artist_notes: reason })
    .eq('id', params.id)
    // Disputes only make sense on active or delivered work.
    .in('status', ['in_progress', 'delivered'])
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Only active or delivered commissions can be disputed.' }, { status: 409 });
  return NextResponse.json(data);
}
