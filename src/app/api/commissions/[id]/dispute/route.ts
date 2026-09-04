import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

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
    .select('requester_id, status')
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

  // Disputes only make sense on active or delivered work. Checked here so the
  // update below can compare-and-swap on the EXACT status it read, which is
  // also the status pre_dispute_status has to record.
  if (commission.status !== 'in_progress' && commission.status !== 'delivered') {
    return NextResponse.json({ error: 'Only active or delivered commissions can be disputed.' }, { status: 409 });
  }

  const { data, error } = await createAdminSupabaseClient()
    .from('commissions')
    .update({
      status: 'disputed',
      // dispute_reason, not artist_notes (00053): the reason used to
      // overwrite the ARTIST's quote note on the row and destroy it.
      dispute_reason: reason,
      // Persisted so a withdrawn dispute restores the exact prior status
      // instead of guessing between the two.
      pre_dispute_status: commission.status,
    })
    .eq('id', params.id)
    .eq('status', commission.status)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'This commission just changed — reload and try again.' }, { status: 409 });
  return NextResponse.json(data);
}
