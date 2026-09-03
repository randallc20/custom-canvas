import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { cancelUnshippedOrder } from '@/lib/cancelUnshipped';
import { fulfillmentWindow } from '@/utils/fulfillmentWindow';

/** The buyer cancels an order the artist never shipped (L7).
 *
 *  Terms of Sale §3 and Artist Agreement §7: if the window is missed and the
 *  buyer does not agree to a new date, "they may cancel for a full refund and
 *  we will settle it whether or not you approve". This route is that right,
 *  and it deliberately does not consult the artist.
 *
 *  The artist may also use it before shipping ("or cancel and tell the buyer
 *  promptly", §7) — with no window condition, because cancelling their own
 *  unshipped order is theirs to do at any point.
 *
 *  The window gate applies only to the BUYER: the right exists because a
 *  promise was missed, so it opens when the promise is missed. Before that,
 *  a buyer who has changed their mind asks the artist (the Request-a-refund
 *  path), which is the discretionary route the documents describe.
 */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, shipped_at, is_pickup, created_at, buyer_id, proposed_ship_by, agreed_ship_by, fulfillment_window_days, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string } | null;
  const isBuyer = order.buyer_id === user.id;
  const isArtist = artist?.profile_id === user.id;
  if (!isBuyer && !isArtist) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // The Orders page hides the button for pickup, but a buyer who has already
  // collected the piece could POST this route directly after the window and
  // be refunded in full (r6 money pass, P0). There is no shipping window on a
  // pickup order to miss.
  if (order.is_pickup) {
    return NextResponse.json(
      {
        error:
          'This is a local-pickup order — there is no shipping window here. If something has gone wrong with the handoff, write to support@customcanvas.shop.',
      },
      { status: 409 },
    );
  }

  if (order.status !== 'paid' || order.shipped_at) {
    return NextResponse.json(
      { error: 'This order has already shipped or is no longer open. Ask about a return instead.' },
      { status: 409 },
    );
  }

  if (isBuyer) {
    const win = fulfillmentWindow(order as Parameters<typeof fulfillmentWindow>[0]);
    // A proposed-but-unanswered date is itself an admission the window was
    // missed, so it opens the right. A date the buyer ACCEPTED does the
    // opposite: they consented to the delay, so the right returns when that
    // date passes rather than immediately (r5 money pass, P2).
    const openedByProposal = !!order.proposed_ship_by && !order.agreed_ship_by;
    if (!win.missed && !openedByProposal) {
      return NextResponse.json(
        {
          error: win.agreed
            ? `You accepted a new ship-by date of ${win.shipByText}. If the artist misses that, you can cancel for a full refund here.`
            : `The artist still has until ${win.shipByText} to ship. If you have changed your mind, ask the artist in Messages — "Request a refund" on this order starts that.`,
        },
        { status: 409 },
      );
    }
  }

  const admin = createAdminSupabaseClient();
  const result = await cancelUnshippedOrder(admin, {
    orderId: params.id,
    by: isBuyer ? 'buyer' : 'artist',
    // The reason is what happened, from the buyer's side either way: the
    // piece was never shipped. artist_cancelled records that the artist chose
    // to stop rather than being held to a window.
    reason: isBuyer ? 'not_shipped' : 'artist_cancelled',
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, refunded_cents: result.refundedCents });
}
