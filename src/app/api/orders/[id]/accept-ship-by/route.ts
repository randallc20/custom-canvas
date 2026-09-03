import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { postOrderSystemMessage } from '@/lib/orderThread';

/** The buyer accepts the artist's proposed new ship-by date (L7).
 *
 *  Artist Agreement §7 points at the federal mail-and-internet-order rule:
 *  a seller who cannot ship in the promised time must obtain the buyer's
 *  CONSENT to the delay, or refund them promptly. This route is that consent,
 *  and the point of recording it is that it is a fact about the buyer's
 *  choice, not the artist's claim about it — so it is written from the buyer's
 *  session and posted into the thread where both parties can see it.
 *
 *  It extends `fulfillment_window_days` so the missed-window prompts stop
 *  nagging a buyer who has already agreed, and so the cron leaves the order
 *  alone. It deliberately does NOT move the seller-protection window:
 *  requirement 1 is measured against the original 5 business days, and the
 *  artist's badge says so. An artist cannot buy protection back by asking for
 *  more time.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, shipped_at, created_at, buyer_id, listing_id, proposed_ship_by, fulfillment_window_days, refund_approved_at, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.buyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (!order.proposed_ship_by) {
    return NextResponse.json({ error: 'The artist has not proposed a new date.' }, { status: 409 });
  }
  if (order.status !== 'paid' || order.shipped_at) {
    return NextResponse.json({ error: 'This order has already shipped.' }, { status: 409 });
  }
  // A refund is already being settled on this order, and accepting a new ship
  // date here would work against the buyer twice over: it writes
  // `agreed_ship_by`, which makes `fulfillmentWindow().missed` false and so
  // takes away their own Terms of Sale §3 cancel right — their only
  // self-serve escape if the settle stalls — and it tells the artist to ship a
  // piece the artist has no button to ship (r11 money pass, P1). The buyer's
  // card no longer offers this; the refusal is for a stale tab.
  if (order.refund_approved_at) {
    return NextResponse.json(
      {
        error:
          'A refund has already been approved on this order and we are settling it. There is no new date to accept — if you would rather have the piece after all, say so in Messages.',
      },
      { status: 409 },
    );
  }

  const target = new Date(order.proposed_ship_by as string);

  const admin = createAdminSupabaseClient();
  // The consent goes in `agreed_ship_by`, NOT in fulfillment_window_days.
  //
  // That column is the only input to seller-protection requirement 1, and an
  // earlier cut of this route widened it to the agreed span — so an artist
  // who missed the window and got a "yes" had requirement 1 rewritten in
  // their favour, and Custom Canvas would have absorbed a non-receipt
  // chargeback the artist should have borne. The artist could buy protection
  // back by asking for more time, which is exactly what the propose modal,
  // both order cards and 00062's comment promise cannot happen. Found by the
  // r5 money review pass.
  const { data: updated, error } = await admin
    .from('orders')
    .update({ agreed_ship_by: target.toISOString(), window_missed_at: null, platform_nudged_at: null })
    .eq('id', params.id)
    .eq('status', 'paid')
    .is('shipped_at', null)
    .is('refund_approved_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'orders.acceptShipBy', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: 'This order has already shipped.' }, { status: 409 });

  const artist = order.artist as unknown as { profile_id: string } | null;
  const dateText = target.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  if (order.buyer_id && artist?.profile_id) {
    await postOrderSystemMessage(admin, {
      buyerId: order.buyer_id,
      artistUserId: artist.profile_id,
      senderId: order.buyer_id,
      listingId: order.listing_id,
      content: `The buyer has accepted the new ship-by date of ${dateText}.`,
      preview: 'New ship-by date accepted',
    });
    await admin.from('notifications').insert({
      user_id: artist.profile_id,
      type: 'order_delayed',
      title: 'New date accepted',
      body: `The buyer accepted your proposed ship-by date of ${dateText}. Seller protection is still measured against the original ${order.fulfillment_window_days ?? 5}-business-day window — accepting a later date does not move it.`,
      link: '/studio/sales',
    });
  }

  return NextResponse.json({ ok: true, agreed_ship_by: target.toISOString() });
}
