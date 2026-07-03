import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: commission } = await supabase
    .from('commissions')
    .select('requester_id, status')
    .eq('id', params.id)
    .single();

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (commission.requester_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Transition guard: accepting a quote starts the work; confirming receipt
  // closes it. Anything else (double-click, stale quote card) is a conflict.
  const next =
    commission.status === 'quoted' ? 'in_progress'
    : commission.status === 'delivered' ? 'confirmed'
    : null;
  if (!next) {
    return NextResponse.json({ error: 'This commission is not awaiting your confirmation.' }, { status: 409 });
  }

  const { data, error } = await createAdminSupabaseClient()
    .from('commissions')
    .update({ status: next })
    .eq('id', params.id)
    .eq('status', commission.status)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
