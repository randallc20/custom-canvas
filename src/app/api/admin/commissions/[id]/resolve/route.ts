import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

/** Ruling D5: a disputed commission had no exit — no party action, no admin
 *  control, no status writer that accepts `disputed` as a source. This is the
 *  exit: an admin closes it as confirmed (the work stands) or cancelled (it
 *  does not), with a reason both sides can see. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const outcome = body?.outcome;
  if (outcome !== 'confirmed' && outcome !== 'cancelled') {
    return NextResponse.json({ error: 'Outcome must be "confirmed" or "cancelled".' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  if (!reason) {
    return NextResponse.json({ error: 'Please record why this dispute was resolved that way.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: commission, error } = await admin
    .from('commissions')
    .update({
      status: outcome,
      closed_by: 'admin',
      closed_reason: reason,
      pre_dispute_status: null,
    })
    .eq('id', params.id)
    // Compare-and-swap: only a still-disputed commission can be resolved, so
    // two admins acting at once cannot both close it.
    .eq('status', 'disputed')
    .select('id, title, requester_id, artist_id, conversation_id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!commission) {
    return NextResponse.json({ error: 'This commission is no longer disputed.' }, { status: 409 });
  }

  // Tell both sides. requester_id is NULL once their account is deleted
  // (00049) — the resolution still stands, there is just nobody to tell.
  const link = commission.conversation_id
    ? `/messages/${commission.conversation_id}`
    : '/messages';
  const title = outcome === 'confirmed' ? 'Dispute resolved — commission confirmed' : 'Dispute resolved — commission cancelled';
  const notifyBody = `Custom Canvas reviewed the dispute on "${commission.title}": ${reason}`;
  const type = outcome === 'confirmed' ? 'commission_confirmed' : 'commission_declined';

  const { data: artist } = await admin
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', commission.artist_id)
    .maybeSingle();

  const recipients = [commission.requester_id, artist?.profile_id].filter(
    (id): id is string => typeof id === 'string'
  );
  if (recipients.length) {
    const { error: notifyError } = await admin.from('notifications').insert(
      recipients.map((id) => ({ user_id: id, type, title, body: notifyBody, link }))
    );
    // The resolution is done and must not be reported as failed over a
    // notification write; it still has to reach someone.
    if (notifyError) console.error('[admin/commissions/resolve] notify failed:', notifyError.message);
  }

  return NextResponse.json({ ok: true, status: outcome });
}
