import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: commission } = await supabase
    .from('commissions')
    .select('artist_id, requester_id, status')
    .eq('id', params.id)
    .single();

  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', commission.artist_id)
    .single();

  const isArtist = artist?.profile_id === user.id;
  const isRequester = commission.requester_id === user.id;

  if (!isArtist && !isRequester) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Only open requests/quotes can be declined or cancelled — accepted work
  // must go through delivery or dispute.
  if (commission.status !== 'pending' && commission.status !== 'quoted') {
    return NextResponse.json({ error: 'This commission can no longer be cancelled.' }, { status: 409 });
  }

  // Optional close reason (the artist's Decline form sends one). Who closed
  // it is recorded so the UI can label "Declined by artist" vs "Cancelled by
  // you" instead of a bare "Closed".
  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const { data, error } = await createAdminSupabaseClient()
    .from('commissions')
    .update({
      status: 'cancelled',
      closed_by: isArtist ? 'artist' : 'requester',
      closed_reason: reason || null,
    })
    .eq('id', params.id)
    .eq('status', commission.status)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
