import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { calculateRefundSplit, isFaultRefund, type RefundReason } from '@/utils/refundSplit';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * The one place money goes back to a buyer.
 *
 * Extracted from the admin settle route (L7) because it acquired two more
 * callers: the buyer cancelling an order the artist never shipped, and the
 * fulfilment-window cron cancelling one the artist went silent on. Three
 * copies of Stripe idempotency keys, the exact-payout reversal and the
 * relist rule is not a thing to have.
 *
 * Policy (DECISIONS.md 2026-07-06, tax 2026-08-18, reason split 2026-09-03):
 * the buyer gets the artwork price + shipping + the tax on those lines back,
 * and on a FAULT reason the service fee and its tax as well; the artist
 * returns their full payout (85% + shipping); the platform returns its
 * commission.
 *
 * Crash safety, unchanged from the original: each Stripe mutation carries an
 * idempotency key and its resulting object id is persisted immediately, so a
 * retry resumes from the failed step instead of re-attempting a completed
 * refund (which Stripe rejects, which used to wedge the order forever).
 */

export type SettleRefundOutcome =
  | {
      ok: true;
      refundedCents: number;
      taxRefundedCents: number;
      payoutReversedCents: number;
      /** True when this call did the work; false when it was already done. */
      relisted: boolean;
    }
  | { ok: false; status: number; error: string };

const RETRY_CLOSE = 'Refund done at Stripe but the order could not be closed — retry.';

export async function settleRefund(
  admin: AdminClient,
  opts: {
    orderId: string;
    reason: RefundReason;
    initiatedBy: 'artist' | 'buyer' | 'platform';
    /** Free text carried into the Stripe refund's metadata. */
    note?: string;
    /**
     * Extra guard for callers that must only act on an unshipped order — the
     * buyer's cancel right and the cron both apply only before shipment
     * (Terms of Sale §3, Artist Agreement §7). Checked inside the same read
     * the money decision is made from, so it cannot be raced past.
     */
    requireUnshipped?: boolean;
  },
): Promise<SettleRefundOutcome> {
  const { data: order } = await admin
    .from('orders')
    .select(
      'id, status, stripe_payment_intent_id, amount_cents, shipping_cents, buyer_fee_cents, amount_tax_cents, artist_payout_cents, listing_id, stripe_refund_id, stripe_reversal_id, refund_approved_at, refund_reason, shipped_at',
    )
    .eq('id', opts.orderId)
    .single();
  if (!order) return { ok: false, status: 404, error: 'Not found' };
  if (order.status === 'refunded') return { ok: false, status: 400, error: 'Already refunded' };
  // Stripe refuses refunds while a chargeback is open, and a refund settled
  // between the ruling and the closed event's delivery is exactly what the
  // dispute restore must not overwrite. Wait for the dispute to close.
  if (order.status === 'disputed') {
    return {
      ok: false,
      status: 409,
      error:
        'This order is under an open chargeback. Stripe will not refund it until the dispute closes; settle it then.',
    };
  }
  if (opts.requireUnshipped && (order.shipped_at || order.status !== 'paid')) {
    return {
      ok: false,
      status: 409,
      error: 'This order has already shipped — talk to the artist about a return instead.',
    };
  }
  if (!order.stripe_payment_intent_id) {
    return { ok: false, status: 409, error: 'This order has no payment to refund.' };
  }

  // "Approving a refund is your decision, not ours — with four exceptions"
  // (Artist Agreement §8). A fault reason IS that exception and needs no
  // artist approval; a discretionary change-of-mind refund does.
  if (!isFaultRefund(opts.reason) && !order.refund_approved_at) {
    return {
      ok: false,
      status: 409,
      error:
        "A change-of-mind refund needs the artist to approve it first. If the fault is ours or the artist's — never shipped, lost, damaged, not as described, our error — choose that reason instead and this settles without them.",
    };
  }

  const stripe = getStripe();
  const { refundTax, refundAmount, refundFee } = calculateRefundSplit(order, opts.reason);

  // Record the decision BEFORE moving money, so a crash between Stripe and
  // the close leaves a row that says what was being done and at what split.
  // The columns are frozen for everyone but the service role (00061).
  await admin
    .from('orders')
    .update({ refund_reason: opts.reason, refund_initiated_by: opts.initiatedBy })
    .eq('id', order.id)
    .is('refund_reason', null);

  let refundId = order.stripe_refund_id as string | null;
  let reversalId = order.stripe_reversal_id as string | null;

  try {
    // Step 1 — buyer refund (skipped on retry if already created).
    if (!refundId) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id,
          amount: refundAmount,
          reverse_transfer: false,
          metadata: {
            policy_refund: 'true',
            order_id: order.id,
            refund_reason: opts.reason,
            refund_initiated_by: opts.initiatedBy,
            fee_refunded: String(refundFee > 0),
            // Stripe caps a metadata value at 500 characters and rejects the
            // whole refund over it — which the catch below then reported as
            // "safe to retry", into the same rejection (01-r2 appendix).
            ...(opts.note ? { admin_reason: opts.note.slice(0, 500) } : {}),
          },
        },
        { idempotencyKey: `refund_${order.id}` },
      );
      refundId = refund.id;
      await admin.from('orders').update({ stripe_refund_id: refundId }).eq('id', order.id);
    }

    // Step 2 — exact artist payout reversal (skipped on retry if done).
    if (!reversalId && order.artist_payout_cents > 0) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (charge?.transfer) {
        const reversal = await stripe.transfers.createReversal(
          typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id,
          { amount: order.artist_payout_cents },
          { idempotencyKey: `reversal_${order.id}` },
        );
        reversalId = reversal.id;
        await admin.from('orders').update({ stripe_reversal_id: reversalId }).eq('id', order.id);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    // State so far is persisted — a retry resumes from the failed step.
    return {
      ok: false,
      status: 502,
      error: refundId
        ? 'Buyer refunded, but the artist payout reversal failed — RETRY to complete it.'
        : 'Refund failed at Stripe — safe to retry.',
    };
  }

  // Step 3 — close the order. CAS so concurrent settles resolve cleanly (the
  // Stripe idempotency keys already made their money ops no-ops). The write
  // is asserted: the money has moved at Stripe, so a close that silently
  // fails leaves a `paid` order the artist can still ship.
  const wasShipped = order.status === 'shipped' || order.status === 'delivered';
  const { data: closed, error: closeError } = await admin
    .from('orders')
    .update({ status: 'refunded' })
    .neq('status', 'refunded')
    .eq('id', order.id)
    .select('id')
    .maybeSingle();
  if (closeError || !closed) {
    Sentry.captureException(
      new Error(`Refund close failed on order ${order.id}: ${closeError?.message ?? 'zero rows'}`),
    );
    return { ok: false, status: 502, error: RETRY_CLOSE };
  }

  // Relist ONLY a never-shipped piece — a shipped/delivered artwork is
  // physically with the buyer; the artist relists manually after return — and
  // only from `sold`: a listing the artist has since hidden stays hidden. No
  // OTHER order may hold the slot: the set matches
  // orders_one_live_per_listing (00055) — a disputed order holds it too.
  let relisted = false;
  if (order.listing_id && !wasShipped) {
    const { count, error: countError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', order.listing_id)
      .in('status', ['paid', 'shipped', 'delivered', 'disputed'])
      .neq('id', order.id);
    if (countError) {
      Sentry.captureException(
        new Error(`Relist check failed for listing ${order.listing_id}: ${countError.message}`),
      );
      return { ok: false, status: 502, error: RETRY_CLOSE };
    }
    if ((count ?? 0) === 0) {
      const { data: row, error: relistError } = await admin
        .from('listings')
        .update({ status: 'available', sold_price_cents: null })
        .eq('id', order.listing_id)
        .eq('status', 'sold')
        .select('id')
        .maybeSingle();
      if (relistError) {
        Sentry.captureException(
          new Error(`Relist of ${order.listing_id} failed after refund: ${relistError.message}`),
        );
        return { ok: false, status: 502, error: RETRY_CLOSE };
      }
      // Zero rows is legitimate here: the listing is not `sold` any more (the
      // artist hid it, or a retry already relisted it) — that is the "stays
      // hidden" rule above, not a refused write.
      if (row) relisted = true;
      else {
        Sentry.captureMessage(
          `Refund on order ${order.id}: listing ${order.listing_id} not relisted (no longer 'sold').`,
          'info',
        );
      }
    }
  }

  return {
    ok: true,
    refundedCents: refundAmount,
    taxRefundedCents: refundTax,
    payoutReversedCents: reversalId ? order.artist_payout_cents : 0,
    relisted,
  };
}
