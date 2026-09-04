import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Lost the compare-and-swap (the other party moved it in between):
  // .single() turned that into a 500 with a raw PostgREST message.
  if (!data) {
    return NextResponse.json({ error: 'This commission just changed — reload and try again.' }, { status: 409 });
  }
  return NextResponse.json(data);
}
