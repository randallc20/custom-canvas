import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { settleRefund } from '@/lib/settleRefund';
import { postOrderSystemMessage } from '@/lib/orderThread';
import { sendOrderCancelledEmail } from '@/services/email';
import { formatPrice } from '@/utils/formatPrice';
import { isFaultRefund, type RefundReason } from '@/utils/refundSplit';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Cancel an unshipped order and refund it in full (L7).
 *
 * Three callers, one behaviour, because the documents give the same outcome
 * three different triggers:
 *
 *  - the BUYER, when the 5-business-day window passed and they would rather
 *    have their money than a new date. Terms of Sale §3 and Artist Agreement
 *    §7: "they may cancel for a full refund and we will settle it whether or
 *    not you approve." So this does not ask the artist.
 *  - the ARTIST, before shipping (Artist Agreement §7, "or cancel and tell
 *    the buyer promptly").
 *  - the PLATFORM, when the artist has been unreachable for five business
 *    days after we asked (Shipping, "If your piece is never shipped").
 *
 * Ordinarily every one of them is a FAULT refund: the whole charge goes back,
 * service fee included. A buyer who never received a piece does not pay us a
 * fee for the transaction that did not happen.
 *
 * The exception is an order whose refund the ARTIST has already approved. The
 * buyer's §3 door stays open there — settling is a manual admin action and
 * they must not be stuck waiting on a queue — but the money follows the
 * approval rather than the door. Without that, a buyer whose change-of-mind
 * refund was approved on day six could press Cancel and be handed the service
 * fee as well, out of the artist's and the platform's pocket, on the one order
 * where the product had just told the artist NOT to ship. The same conversion
 * was ruled a defect at the cron (r8) and at the artist's own button (r10);
 * this is the third door in that class (r13).
 *
 * The refund itself, the payout reversal and the relist are settleRefund's;
 * this adds the telling — thread, bell and email, to whichever party did not
 * do the cancelling.
 */
export async function cancelUnshippedOrder(
  admin: AdminClient,
  opts: {
    orderId: string;
    by: 'buyer' | 'artist' | 'platform';
    /** `not_shipped` / `artist_cancelled` ordinarily; the reason the artist
     *  already agreed to when this cancels a refund they approved. */
    reason: RefundReason;
    note?: string;
  },
): Promise<{ ok: true; refundedCents: number } | { ok: false; status: number; error: string }> {
  const { data: order } = await admin
    .from('orders')
    .select('id, buyer_id, listing_id, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', opts.orderId)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, error: 'Not found' };

  const result = await settleRefund(admin, {
    orderId: opts.orderId,
    reason: opts.reason,
    initiatedBy: opts.by,
    note: opts.note ?? `Unshipped order cancelled by the ${opts.by}`,
    // The whole point: this path exists only before shipment. Checked inside
    // settleRefund's own read so a concurrent "mark shipped" cannot slip
    // between the check and the money.
    requireUnshipped: true,
  });
  if (!result.ok) return result;

  const artist = order.artist as unknown as { profile_id: string; display_name: string } | null;
  const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
  const amountText = formatPrice(result.refundedCents);
  // "in full, including the service fee" is only true of a fault refund. On a
  // change-of-mind refund the artist approved, the fee is retained and saying
  // otherwise misstates the money in the one record both parties can see.
  const inFull = isFaultRefund(opts.reason);
  const fullText = inFull ? ' in full' : '';
  const feeText = inFull ? ', including the service fee' : ', with the service fee retained';

  // The thread gets the note either way — it is the record both parties can
  // see, and it is what requirement 6's reply-window read looks at.
  if (order.buyer_id && artist?.profile_id) {
    await postOrderSystemMessage(admin, {
      buyerId: order.buyer_id,
      artistUserId: artist.profile_id,
      senderId: opts.by === 'artist' ? artist.profile_id : order.buyer_id,
      listingId: order.listing_id,
      content:
        opts.by === 'buyer'
          ? inFull
            ? `The buyer cancelled this order for "${title}" because it was not shipped within the promised window. It has been refunded in full (${amountText}), including the service fee.`
            : `The buyer closed out the refund the artist had already approved on this order for "${title}". It has been refunded (${amountText})${feeText}.`
          : opts.by === 'artist'
          ? `The artist cancelled this order for "${title}" before shipping. It has been refunded${fullText} (${amountText})${feeText}.`
          : `Custom Canvas cancelled this order for "${title}": it was not shipped within the promised window and we were unable to reach the artist. It has been refunded${fullText} (${amountText})${feeText}.`,
      preview: 'Order cancelled and refunded',
    });
  }

  // Notify and email the party who did NOT do it, plus admins when the
  // platform acted on its own.
  const recipients: { id: string; role: 'buyer' | 'artist' }[] = [];
  if (opts.by !== 'buyer' && order.buyer_id) recipients.push({ id: order.buyer_id, role: 'buyer' });
  if (opts.by !== 'artist' && artist?.profile_id) recipients.push({ id: artist.profile_id, role: 'artist' });

  for (const r of recipients) {
    const body =
      r.role === 'buyer'
        ? `"${title}" has been cancelled and refunded${fullText} (${amountText})${feeText}.`
        : inFull
          ? `The order for "${title}" was cancelled and refunded in full (${amountText}) because it was not shipped within the promised window. Your payout for it has been reversed.`
          // Not "you missed a shipping promise": the artist approved this
          // refund themselves and the product told them not to ship.
          : `The buyer closed out the refund you approved on "${title}". It has been refunded (${amountText})${feeText} and your payout for it has been reversed.`;
    const { error } = await admin.from('notifications').insert({
      user_id: r.id,
      type: 'order_cancelled',
      title: 'Order cancelled and refunded',
      body,
      link: r.role === 'buyer' ? '/orders' : '/studio/sales',
    });
    if (error) Sentry.captureException(error, { extra: { where: 'cancelUnshipped.notify', orderId: opts.orderId } });

    const { data: person } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', r.id)
      .maybeSingle();
    if (person?.email && r.role === 'buyer') {
      sendOrderCancelledEmail(
        person.email as string,
        (person.full_name as string) ?? 'Collector',
        title,
        amountText,
        opts.by,
      ).catch((e) => Sentry.captureException(e));
    }
  }

  if (opts.by === 'platform') {
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin');
    if (admins?.length) {
      await admin.from('notifications').insert(
        admins.map((a) => ({
          user_id: a.id,
          type: 'order_cancelled' as const,
          title: 'Auto-cancelled an abandoned order',
          body: `"${title}" was not shipped and ${artist?.display_name ?? 'the artist'} did not respond after we asked. Refunded ${amountText} in full and reversed the payout.`,
          link: '/admin/orders',
        })),
      );
    }
  }

  return { ok: true, refundedCents: result.refundedCents };
}
