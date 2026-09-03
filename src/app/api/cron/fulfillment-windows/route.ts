import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { cancelUnshippedOrder } from '@/lib/cancelUnshipped';
import { postOrderSystemMessage } from '@/lib/orderThread';
import { businessDaysBetween } from '@/utils/evaluateProtection';
import { fulfillmentWindow } from '@/utils/fulfillmentWindow';

/**
 * Daily: the missed-window path nobody is present for (L7).
 *
 * Shipping, "If your piece is never shipped": the artist should offer a new
 * date or a cancellation. "If we cannot reach the artist within five business
 * days of asking, we cancel the order and refund you." Nothing ran when a
 * window passed, so an artist who simply stopped answering left the buyer
 * with a charge, no piece, and no route that did not depend on the artist
 * choosing to act.
 *
 * Two stages, deliberately separated by a real waiting period:
 *
 *  1. The window has passed, no shipment, no proposed date: ask the artist to
 *     ship or offer a date, tell the buyer where they stand, and stamp
 *     `platform_nudged_at`. Nothing is cancelled — an artist who is two days
 *     late and about to ship should not lose the sale to a cron.
 *  2. Five business days after that nudge, still unshipped, and the artist
 *     has said nothing in the thread since: cancel and refund in full. This
 *     is the "whether or not the artist agrees" branch, and it is the only
 *     automated money movement in the product.
 *
 * "Unreachable" is measured as no artist message in the buyer↔artist thread
 * since the nudge — the same thread and the same read that seller-protection
 * requirement 6 uses, so an artist who replied to the buyer is never treated
 * as silent even if they never touched the order.
 */

const NUDGE_WAIT_BUSINESS_DAYS = 5;
/** Belt and braces on a nightly job that moves money: a bad query cannot
 *  cancel the whole catalogue in one pass. */
const MAX_CANCELS_PER_RUN = 25;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, created_at, shipped_at, is_pickup, buyer_id, listing_id, fulfillment_window_days, proposed_ship_by, agreed_ship_by, window_missed_at, platform_nudged_at, artist:artist_profiles(profile_id, display_name), listing:listings(title)',
    )
    .eq('status', 'paid')
    .is('shipped_at', null)
    // LOCAL PICKUP has no shipping promise to miss and never gets a
    // shipped_at, so without this every pickup order looked overdue on day 6:
    // the artist was told to ship a piece nobody agreed to post, the buyer was
    // told about a window they were never shown, and five business days later
    // this refunded a collected painting in full and relisted it (r6 money
    // pass, P0). A pickup no-show is a support process.
    .eq('is_pickup', false)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    Sentry.captureException(error, { extra: { where: 'cron.fulfillmentWindows.read' } });
    return NextResponse.json({ error: 'Read failed' }, { status: 500 });
  }

  let nudged = 0;
  let cancelled = 0;
  let waiting = 0;

  for (const o of orders ?? []) {
    // One definition of "late", shared with both order cards and the buyer's
    // cancel right — including the buyer's consent to a later date, which
    // moves this deadline but NOT the seller-protection window (00066).
    const win = fulfillmentWindow(o as Parameters<typeof fulfillmentWindow>[0], new Date(nowIso));
    if (!win.missed) continue;
    const windowDays = win.windowDays;

    const artist = o.artist as unknown as { profile_id: string; display_name: string } | null;
    const title = (o.listing as unknown as { title: string } | null)?.title ?? 'an order';

    // Stage 2 — nudged, waited, still nothing.
    if (o.platform_nudged_at) {
      const sinceNudge = businessDaysBetween(o.platform_nudged_at as string, nowIso);
      if (sinceNudge < NUDGE_WAIT_BUSINESS_DAYS) {
        waiting += 1;
        continue;
      }
      // A proposed date the buyer has not acted on is still the artist
      // engaging: leave it to the buyer to accept or cancel.
      if (o.proposed_ship_by) {
        waiting += 1;
        continue;
      }
      if (await artistSpokeSince(supabase, o, o.platform_nudged_at as string)) {
        waiting += 1;
        continue;
      }
      if (cancelled >= MAX_CANCELS_PER_RUN) {
        Sentry.captureMessage(
          `fulfillment-windows: hit the ${MAX_CANCELS_PER_RUN}-cancel cap in one run; the rest wait for tomorrow.`,
          'warning',
        );
        break;
      }
      const result = await cancelUnshippedOrder(supabase, {
        orderId: o.id as string,
        by: 'platform',
        reason: 'not_shipped',
        note: 'Auto-cancelled: unshipped past the window and the artist did not respond to our request.',
      });
      if (result.ok) cancelled += 1;
      else {
        Sentry.captureMessage(
          `fulfillment-windows: could not cancel order ${o.id}: ${result.error}`,
          'error',
        );
      }
      continue;
    }

    // Stage 1 — the window has passed and nobody has said anything.
    if (o.proposed_ship_by) continue;

    const { data: stamped, error: stampError } = await supabase
      .from('orders')
      .update({ platform_nudged_at: nowIso, window_missed_at: o.window_missed_at ?? nowIso })
      .eq('id', o.id)
      .is('platform_nudged_at', null)
      .eq('status', 'paid')
      .is('shipped_at', null)
      .select('id')
      .maybeSingle();
    if (stampError) {
      Sentry.captureException(stampError, { extra: { where: 'cron.fulfillmentWindows.nudge', orderId: o.id } });
      continue;
    }
    // Zero rows: a concurrent run stamped it, or it shipped between the read
    // and the write. Either way it is not ours to nudge.
    if (!stamped) continue;

    if (artist?.profile_id) {
      await supabase.from('notifications').insert({
        user_id: artist.profile_id,
        type: 'order_delayed',
        title: 'Ship this order, or offer a new date',
        body: `"${title}" has passed its ${windowDays}-business-day shipping window and is not marked shipped. Ship it now, or offer the buyer a new date from Studio › Sales. If we do not hear from you within ${NUDGE_WAIT_BUSINESS_DAYS} business days we will cancel the order and refund the buyer in full.`,
        link: '/studio/sales',
      });
    }
    if (o.buyer_id) {
      await supabase.from('notifications').insert({
        user_id: o.buyer_id,
        type: 'order_delayed',
        title: 'Your order has missed its shipping window',
        body: `"${title}" has not shipped within the promised window. We have asked the artist to ship it or offer you a new date. You can cancel for a full refund at any time from your order.`,
        link: '/orders',
      });
    }
    if (o.buyer_id && artist?.profile_id) {
      await postOrderSystemMessage(supabase, {
        buyerId: o.buyer_id as string,
        artistUserId: artist.profile_id,
        // The platform is speaking here, and the buyer is the party being
        // protected — attribute it to them rather than putting words in the
        // artist's mouth.
        senderId: o.buyer_id as string,
        listingId: o.listing_id as string | null,
        content: `Custom Canvas: this order has passed its ${windowDays}-business-day shipping window. We have asked the artist to ship it or propose a new date. The buyer can cancel for a full refund at any time.`,
        preview: 'Shipping window missed',
      });
    }
    nudged += 1;
  }

  return NextResponse.json({ ok: true, nudged, cancelled, waiting });
}

/** Has the artist said anything to the buyer since we asked? Read the same
 *  way requirement 6 reads it: conversations are keyed by the participant
 *  pair, so the thread is found by the pair and messages after the timestamp
 *  are counted. A read failure returns TRUE — the lenient direction, because
 *  the consequence of being wrong here is cancelling a live sale. */
async function artistSpokeSince(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  order: { buyer_id: unknown; artist: unknown },
  sinceIso: string,
): Promise<boolean> {
  const buyerId = order.buyer_id as string | null;
  const artist = order.artist as { profile_id: string } | null;
  if (!buyerId || !artist?.profile_id) return true;

  const { data: convos, error: convoError } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_one.eq.${buyerId},participant_two.eq.${artist.profile_id}),and(participant_one.eq.${artist.profile_id},participant_two.eq.${buyerId})`,
    );
  if (convoError) {
    Sentry.captureException(convoError, { extra: { where: 'cron.fulfillmentWindows.convos' } });
    return true;
  }
  const ids = (convos ?? []).map((c) => c.id as string);
  if (!ids.length) return false;

  const { data: msgs, error: msgError } = await supabase
    .from('messages')
    .select('id')
    .in('conversation_id', ids)
    .eq('sender_id', artist.profile_id)
    // Anything the artist actually wrote. The composer sends an attachment as
    // its own row with message_type 'image' or 'file' and no accompanying
    // text, so filtering to 'text' treated an artist who answered with a
    // photo of the packed crate as silent — and this cron cancels and refunds
    // the sale on that basis (r7 money pass, P1). Only `system` is excluded,
    // because those are ours.
    .neq('message_type', 'system')
    .gt('created_at', sinceIso)
    .limit(1);
  if (msgError) {
    Sentry.captureException(msgError, { extra: { where: 'cron.fulfillmentWindows.msgs' } });
    return true;
  }
  return (msgs ?? []).length > 0;
}
