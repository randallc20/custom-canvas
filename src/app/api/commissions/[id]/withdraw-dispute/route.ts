import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

/** The other half of ruling D5: the requester who raised the dispute can take
 *  it back, which returns the commission to exactly the status it held when
 *  they raised it (persisted at dispute time — 00053 — rather than guessed). */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate, { status: 403 });

  const { data: commission } = await supabase
    .from('commissions')
    .select('requester_id, status, pre_dispute_status, title, artist_id, conversation_id')
    .eq('id', params.id)
    .maybeSingle();

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (commission.requester_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (commission.status !== 'disputed') {
    return NextResponse.json({ error: 'This commission is not disputed.' }, { status: 409 });
  }

  // Rows disputed before 00053 have no stored status; 'in_progress' is the
  // safe restore (it is the only one of the two that leaves the artist able
  // to deliver again).
  const restored = commission.pre_dispute_status ?? 'in_progress';

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('commissions')
    .update({ status: restored, pre_dispute_status: null, dispute_reason: null })
    .eq('id', params.id)
    .eq('status', 'disputed')
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'This commission is no longer disputed.' }, { status: 409 });

  const { data: artist } = await admin
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', commission.artist_id)
    .maybeSingle();
  if (artist?.profile_id) {
    const { error: notifyError } = await admin.from('notifications').insert({
      user_id: artist.profile_id,
      type: 'commission_update',
      title: 'Dispute withdrawn',
      body: `The dispute on "${commission.title}" was withdrawn — the commission is active again.`,
      link: commission.conversation_id ? `/messages/${commission.conversation_id}` : '/messages',
    });
    if (notifyError) console.error('[commissions/withdraw-dispute] notify failed:', notifyError.message);
  }

  return NextResponse.json(data);
}
