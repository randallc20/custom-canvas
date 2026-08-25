import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Both parties confirm a local-pickup handoff. Seller protection short-circuits
// for pickup orders — protected only when BOTH confirm — so this is the only
// route by which a pickup order can become protected.
//
// The columns are guard-frozen (00042), so neither party can write them
// directly: we establish who is calling and stamp only THEIR column with the
// service-role client. An artist confirming on the buyer's behalf would be
// manufacturing their own protection.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, is_pickup, buyer_id, artist_id, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!order.is_pickup) {
    return NextResponse.json({ error: 'This order ships — there is no pickup to confirm.' }, { status: 400 });
  }
  if (!['paid', 'shipped', 'delivered'].includes(order.status)) {
    return NextResponse.json({ error: 'This order is not open.' }, { status: 409 });
  }

  const { data: artist } = await admin
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', order.artist_id)
    .maybeSingle();

  const isBuyer = order.buyer_id === user.id;
  const isArtist = artist?.profile_id === user.id;
  if (!isBuyer && !isArtist) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const column = isBuyer ? 'pickup_confirmed_by_buyer_at' : 'pickup_confirmed_by_artist_at';
  if (order[column as keyof typeof order]) {
    return NextResponse.json({ error: 'You have already confirmed this handoff.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await admin.from('orders').update({ [column]: now }).eq('id', order.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bothConfirmed = isBuyer
    ? !!order.pickup_confirmed_by_artist_at
    : !!order.pickup_confirmed_by_buyer_at;

  // Once both have confirmed, the handoff happened: mark it delivered so the
  // order reads correctly everywhere else (reviews, protection, buyer history).
  if (bothConfirmed && order.status !== 'delivered') {
    await admin.from('orders').update({ status: 'delivered' }).eq('id', order.id);
  }

  return NextResponse.json({ confirmed: true, bothConfirmed });
}
