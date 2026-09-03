import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { formatPrice } from '@/utils/formatPrice';

/** The artist says they do not wish to contest a dispute (Artist Agreement
 *  §4, "Accepting a dispute" — L12).
 *
 *  This records a PREFERENCE, not an outcome, and the wording everywhere says
 *  so. The agreement is explicit that Custom Canvas may contest a dispute
 *  anyway "when necessary to prevent fraud, protect the Platform, or comply
 *  with processor requirements", and that a dispute counts against the
 *  platform's standing with the card networks however it ends. So the artist
 *  gets a way to tell us, and support gets a record of who asked and when —
 *  what §4 offers in return is that we will not "impose an additional
 *  platform penalty solely because you declined to contest it", which is a
 *  policy commitment rather than a code path.
 *
 *  Compare-and-swap on `dispute_conceded_at IS NULL`; the column is frozen
 *  for non-privileged writers (00060), so this route is the only writer.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, amount_cents, dispute_conceded_at, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string; display_name: string } | null;
  if (!artist || artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (order.status !== 'disputed') {
    return NextResponse.json(
      { error: 'This order is not under an open dispute.' },
      { status: 409 },
    );
  }
  if (order.dispute_conceded_at) {
    return NextResponse.json({ error: 'You have already told us that.' }, { status: 409 });
  }

  const admin = createAdminSupabaseClient();
  const { data: updated, error } = await admin
    .from('orders')
    .update({ dispute_conceded_at: new Date().toISOString() })
    .eq('id', params.id)
    .is('dispute_conceded_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'orders.concedeDispute', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'You have already told us that.' }, { status: 409 });

  // Support has to know before the response deadline, or the preference
  // arrives too late to act on.
  const { data: admins, error: adminsError } = await admin.from('profiles').select('id').eq('role', 'admin');
  if (adminsError) {
    Sentry.captureException(adminsError, { extra: { where: 'orders.concedeDispute.admins' } });
  } else if (admins?.length) {
    const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
    await admin.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'order_disputed',
        title: 'Artist does not wish to contest',
        body: `${artist.display_name} does not wish to contest the dispute on "${title}" (${formatPrice(order.amount_cents)}). We may still contest it if fraud, platform protection or processor requirements call for it (Artist Agreement §4) — decide before the bank's deadline.`,
        link: '/admin/orders',
      }))
    );
  }

  return NextResponse.json({ ok: true });
}
