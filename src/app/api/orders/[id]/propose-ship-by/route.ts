import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { postOrderSystemMessage } from '@/lib/orderThread';
import { sendShipByProposedEmail } from '@/services/email';

const bodySchema = z.object({
  // A date, not a timestamp: the artist is promising a day.
  ship_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  note: z.string().trim().max(500).optional(),
});

const MAX_PROPOSAL_DAYS = 60;

/** The artist offers a new ship-by date (Artist Agreement §7, L7).
 *
 *  "If you cannot meet the window. Tell the buyer in Messages before it
 *  expires and offer them the choice of a new date or a cancellation. If the
 *  buyer does not agree to the new date, they may cancel for a full refund
 *  and we will settle it whether or not you approve."
 *
 *  So this does three things at once, and all three matter: it records the
 *  date, it tells the buyer in the thread (which is where the agreement says
 *  the conversation happens, and where requirement 6 reads from), and it
 *  emails them, because a buyer who is waiting on a piece is not necessarily
 *  logged in.
 *
 *  It does NOT extend the seller-protection window. Requirement 1 is tied to
 *  the original 5 business days from the sale, and quietly moving it would let
 *  an artist grant themselves protection by proposing a date. The buyer's
 *  card and the artist's badge both say so.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Midday UTC, so a date never lands on the previous day for a US viewer.
  const shipBy = new Date(`${parsed.data.ship_by}T12:00:00.000Z`);
  if (Number.isNaN(shipBy.getTime())) {
    return NextResponse.json({ error: 'Pick a date.' }, { status: 400 });
  }
  const now = Date.now();
  if (shipBy.getTime() <= now) {
    return NextResponse.json({ error: 'Pick a date in the future.' }, { status: 400 });
  }
  if (shipBy.getTime() > now + MAX_PROPOSAL_DAYS * 86_400_000) {
    return NextResponse.json(
      { error: `A new date has to be within ${MAX_PROPOSAL_DAYS} days. If you cannot ship by then, cancel the order instead.` },
      { status: 400 },
    );
  }

  const { data: order } = await supabase
    .from('orders')
    .select('id, status, shipped_at, buyer_id, listing_id, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = order.artist as unknown as { profile_id: string; display_name: string } | null;
  if (!artist || artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (order.status !== 'paid' || order.shipped_at) {
    return NextResponse.json(
      { error: 'This order has already shipped or is no longer open.' },
      { status: 409 },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: updated, error } = await admin
    .from('orders')
    .update({ proposed_ship_by: shipBy.toISOString() })
    .eq('id', params.id)
    .eq('status', 'paid')
    .is('shipped_at', null)
    .select('id')
    .maybeSingle();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'orders.proposeShipBy', orderId: params.id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'This order has already shipped.' }, { status: 409 });
  }

  const title = (order.listing as unknown as { title: string } | null)?.title ?? 'your order';
  const dateText = shipBy.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  if (order.buyer_id) {
    await postOrderSystemMessage(admin, {
      buyerId: order.buyer_id,
      artistUserId: artist.profile_id,
      // Attributed to the artist: this is the artist telling the buyer
      // something, which is exactly what §7 asks of them.
      senderId: artist.profile_id,
      listingId: order.listing_id,
      content:
        `The artist has proposed shipping "${title}" by ${dateText}.` +
        (parsed.data.note ? `\n\n${parsed.data.note}` : '') +
        '\n\nYou can accept the new date, or cancel for a full refund — both options are on the order in your Orders page.',
      preview: 'New ship-by date proposed',
    });

    await admin.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'order_delayed',
      title: 'New ship-by date proposed',
      body: `${artist.display_name} has proposed shipping "${title}" by ${dateText}. You can accept it, or cancel for a full refund.`,
      link: '/orders',
    });

    const { data: buyer } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.buyer_id)
      .maybeSingle();
    if (buyer?.email) {
      sendShipByProposedEmail(
        buyer.email as string,
        (buyer.full_name as string) ?? 'Collector',
        title,
        artist.display_name,
        dateText,
        parsed.data.note,
      ).catch((e) => Sentry.captureException(e));
    }
  }

  return NextResponse.json({ ok: true, proposed_ship_by: shipBy.toISOString() });
}
