import * as Sentry from '@sentry/nextjs';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { postOrderSystemMessage } from '@/lib/orderThread';
import { sendReturnAuthorizedEmail } from '@/services/email';
import {
  RETURN_SHIP_BY_DAYS,
  formatAddress,
  returnRequiredByDefault,
  returnShippingBearer,
  type ReturnAddress,
  type ReturnRecord,
} from '@/utils/orderReturns';
import { buyerTookPossession, pickupPossessionUnknown } from '@/utils/fulfillment';
import type { RefundReason } from '@/utils/refundSplit';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

// Server-side only: takes a service-role client and sends mail. The pure
// helpers (the settle gate, the defaults, address formatting) live in
// src/utils/orderReturns.ts so client components can use them.

/**
 * Authorise a return: stamp it, tell the buyer where to send the piece and by
 * when, and put the same thing in the thread.
 *
 * The address is only ever revealed here — after authorisation — and never
 * comes from the artist's public profile (ruling D9). An artist's studio
 * address is not something they agreed to publish by listing a painting.
 */
export async function authorizeReturn(
  admin: AdminClient,
  opts: {
    orderId: string;
    reason: RefundReason;
    authorizedBy: string;
    returnAddress: ReturnAddress;
    instructions?: string;
    /** Overrides the reason's default, for a return we require or waive by
     *  judgement (a damaged piece worth inspecting, or one too unsafe to
     *  ship). */
    required?: boolean;
  },
): Promise<{ ok: true; ret: ReturnRecord } | { ok: false; status: number; error: string }> {
  const { data: order } = await admin
    .from('orders')
    .select('id, status, shipped_at, is_pickup, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at, buyer_id, listing_id, artist:artist_profiles(profile_id, display_name), listing:listings(title)')
    .eq('id', opts.orderId)
    .maybeSingle();
  if (!order) return { ok: false, status: 404, error: 'Not found' };
  if (order.status === 'refunded') {
    return { ok: false, status: 409, error: 'This order is already refunded — a return cannot be authorised after the money has gone back.' };
  }

  // Possession is the fact that decides whether the buyer has anything to
  // send back — not the reason, not the caller's optimism, and not shipped_at
  // alone (a collected pickup piece has no shipped_at).
  const required =
    opts.required ??
    returnRequiredByDefault(
      opts.reason,
      buyerTookPossession(order) || pickupPossessionUnknown(order),
    );
  const now = new Date();
  // Seven CALENDAR days, per §5.
  const shipBy = new Date(now.getTime() + RETURN_SHIP_BY_DAYS * 86_400_000);
  const bearer = returnShippingBearer(opts.reason);

  const instructions =
    opts.instructions?.trim() ||
    [
      'Pack the piece in reasonable protective packaging — ideally the packaging it arrived in.',
      'Return it in substantially the same condition you received it.',
      'Use a service with tracking, and reply here with the tracking number.',
      bearer === 'buyer'
        ? 'On a change-of-mind return the buyer ordinarily bears return shipping.'
        : 'The artist ordinarily bears return shipping in this case; keep the receipt and we will sort it out with them.',
    ].join(' ');

  const { data: ret, error } = await admin
    .from('order_returns')
    .upsert(
      {
        order_id: opts.orderId,
        required,
        reason: opts.reason,
        authorized_at: now.toISOString(),
        authorized_by: opts.authorizedBy,
        return_address: opts.returnAddress,
        ship_by: required ? shipBy.toISOString() : null,
        instructions,
      },
      { onConflict: 'order_id' },
    )
    .select('*')
    .single();
  if (error) {
    Sentry.captureException(error, { extra: { where: 'authorizeReturn', orderId: opts.orderId } });
    return { ok: false, status: 500, error: error.message };
  }

  const artist = order.artist as unknown as { profile_id: string; display_name: string } | null;
  const title = (order.listing as unknown as { title: string } | null)?.title ?? 'your order';
  const shipByText = shipBy.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const addressText = formatAddress(opts.returnAddress);

  if (required && order.buyer_id && artist?.profile_id) {
    await postOrderSystemMessage(admin, {
      buyerId: order.buyer_id,
      artistUserId: artist.profile_id,
      senderId: order.buyer_id,
      listingId: order.listing_id,
      content: [
        `Custom Canvas: a return has been authorised for "${title}". Your refund will be settled after the piece is returned and inspected.`,
        '',
        `Send it to:`,
        addressText,
        '',
        `Ship it by ${shipByText} (7 calendar days).`,
        '',
        instructions,
        '',
        'Reply here with the tracking number, or use "I’ve shipped it back" on the order.',
      ].join('\n'),
      preview: 'Return authorised',
    });

    await admin.from('notifications').insert({
      user_id: order.buyer_id,
      type: 'refund_approved',
      title: 'Return authorised',
      body: `Send "${title}" back by ${shipByText}. The address and instructions are on your order and in Messages. Your refund settles after it arrives and is inspected.`,
      link: '/orders',
    });

    const { data: buyer } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.buyer_id)
      .maybeSingle();
    if (buyer?.email) {
      sendReturnAuthorizedEmail(
        buyer.email as string,
        (buyer.full_name as string) ?? 'Collector',
        title,
        addressText,
        shipByText,
        instructions,
      ).catch((e) => Sentry.captureException(e));
    }
  }

  return { ok: true, ret: ret as ReturnRecord };
}
