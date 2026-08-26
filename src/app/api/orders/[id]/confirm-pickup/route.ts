import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
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
//
// The stamp is a single conditional UPDATE (`WHERE <column> IS NULL`) whose
// RETURNING row is read AFTER the write: Postgres row-locking serialises the
// two parties' concurrent confirmations, so the second one sees the first's
// committed column and promotes to delivered. The naive read-then-write
// version left concurrently-confirmed orders stuck at 'paid' forever, with
// every retry bouncing off "already confirmed" before the promotion could
// re-run — which is also why the already-confirmed path below HEALS instead
// of just refusing.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, is_pickup, buyer_id, artist:artist_profiles(profile_id), pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at')
    .eq('id', params.id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!order.is_pickup) {
    return NextResponse.json({ error: 'This order ships — there is no pickup to confirm.' }, { status: 400 });
  }
  // 'delivered' stays confirmable: the second party's late confirmation is what
  // earns protection. 'disputed' is deliberately NOT confirmable — protection
  // evidence must exist when the dispute arrives; a post-dispute self-
  // attestation would let either party manufacture it after money is at stake.
  if (!['paid', 'delivered'].includes(order.status)) {
    return NextResponse.json({ error: 'This order is not open.' }, { status: 409 });
  }

  const artistProfileId = (order.artist as unknown as { profile_id: string } | null)?.profile_id;
  const isBuyer = order.buyer_id === user.id;
  const isArtist = artistProfileId === user.id;
  if (!isBuyer && !isArtist) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const column = isBuyer ? 'pickup_confirmed_by_buyer_at' : 'pickup_confirmed_by_artist_at';

  // Atomic stamp: only writes if this party hasn't confirmed yet, and the
  // returned row reflects the state AFTER this write.
  const { data: fresh, error } = await admin
    .from('orders')
    .update({ [column]: new Date().toISOString() })
    .eq('id', order.id)
    .is(column, null)
    .select('status, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = fresh ?? order; // null fresh = already confirmed; heal from the read
  const bothConfirmed = !!row.pickup_confirmed_by_buyer_at && !!row.pickup_confirmed_by_artist_at;

  // Once both have confirmed, the handoff happened: mark it delivered so the
  // order reads correctly everywhere else (reviews, protection, buyer history).
  // Runs on the already-confirmed path too, so an order that ever got stuck
  // both-confirmed-but-paid repairs itself on the next tap.
  if (bothConfirmed && row.status !== 'delivered') {
    const { error: promoteError } = await admin
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', order.id)
      .in('status', ['paid']);
    if (promoteError) {
      // The confirmation itself stood — surface the failed promotion honestly
      // rather than a clean 200 over a half-finished transition.
      Sentry.captureException(promoteError);
      return NextResponse.json(
        { confirmed: true, bothConfirmed, error: 'Confirmed, but the order could not be marked delivered — try again.' },
        { status: 500 }
      );
    }
  }

  if (!fresh) {
    return NextResponse.json({ confirmed: true, bothConfirmed, alreadyConfirmed: true });
  }
  return NextResponse.json({ confirmed: true, bothConfirmed });
}
