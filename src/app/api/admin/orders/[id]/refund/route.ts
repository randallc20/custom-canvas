import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import {
  calculateRefundSplit,
  isFaultRefund,
  REFUND_REASONS,
  type RefundReason,
} from '@/utils/refundSplit';

// Admin settles an artist-approved refund. Policy (2026-07-06, tax added
// 2026-08-18): the buyer gets the artwork price + shipping + THEIR TAX back
// (platform is merchant of record — tax on refunded lines must be returned);
// the service fee and its tax are never refunded; the artist returns their
// full payout (85% + shipping); the platform returns its 15% commission.
//
// Crash safety: each Stripe mutation carries an idempotency key and its
// resulting object id is persisted immediately. A crash between refund and
// reversal used to wedge the order forever (the retry re-attempted the full
// refund, which Stripe rejected); now a retry skips completed steps and
// finishes the job.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  // Stripe caps a metadata value at 500 characters and rejects the whole
  // refund over it — which the catch below reported as "safe to retry",
  // into the same rejection. Truncate here (01-r2 appendix).
  const adminReason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  // L6: WHY decides the money. change_of_mind keeps the service fee and its
  // tax; every fault reason returns the whole charge (Terms of Sale §2,
  // Artist Agreement §8, Shipping).
  const refundReason: RefundReason | null =
    typeof body?.refund_reason === 'string' && REFUND_REASONS.includes(body.refund_reason as RefundReason)
      ? (body.refund_reason as RefundReason)
      : null;
  if (!refundReason) {
    return NextResponse.json(
      { error: `A refund reason is required. One of: ${REFUND_REASONS.join(', ')}.` },
      { status: 400 },
    );
  }

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, stripe_payment_intent_id, amount_cents, shipping_cents, buyer_fee_cents, amount_tax_cents, artist_payout_cents, listing_id, stripe_refund_id, stripe_reversal_id, refund_approved_at, refund_reason')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 });

  // "Approving a refund is your decision, not ours — with four exceptions"
  // (Artist Agreement §8). A FAULT reason is that exception and may be
  // settled without the artist: a piece that never arrived is not something
  // we ask the artist's permission to put right. A change-of-mind refund is
  // discretionary and needs their approval, or we would be spending their
  // payout on a decision the agreement gives them.
  if (!isFaultRefund(refundReason) && !order.refund_approved_at) {
    return NextResponse.json(
      {
        error:
          'A change-of-mind refund needs the artist to approve it first. If the fault is ours or the artist\'s — never shipped, lost, damaged, not as described, our error — choose that reason instead and this settles without them.',
      },
      { status: 409 },
    );
  }
  // Stripe refuses refunds while a chargeback is open, and a refund settled
  // between the ruling and the closed event's delivery is exactly what the
  // dispute restore must not overwrite. Wait for the dispute to close.
  if (order.status === 'disputed') {
    return NextResponse.json(
      { error: 'This order is under an open chargeback. Stripe will not refund it until the dispute closes; settle it then.' },
      { status: 409 }
    );
  }

  const stripe = getStripe();

  // Refund = price + shipping + the tax attributable to them. Tax was
  // charged on three lines (price, shipping, fee) at a uniform rate, so the
  // fee's share is proportional; the fee and its tax stay with the platform.
  // The arithmetic lives in utils/refundSplit.ts so tests can pin it (R11).
  const { refundTax, refundAmount, refundFee } = calculateRefundSplit(order, refundReason);

  // Record the decision BEFORE moving money, so a crash between Stripe and
  // step 3 leaves a row that says what was being done and at what split. The
  // columns are frozen for everyone but the service role (00061).
  await admin
    .from('orders')
    .update({
      refund_reason: refundReason,
      refund_initiated_by: order.refund_approved_at ? 'artist' : 'platform',
    })
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
            refund_reason: refundReason,
            fee_refunded: String(refundFee > 0),
            ...(adminReason ? { admin_reason: adminReason } : {}),
          },
        },
        { idempotencyKey: `refund_${order.id}` }
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
          { idempotencyKey: `reversal_${order.id}` }
        );
        reversalId = reversal.id;
        await admin.from('orders').update({ stripe_reversal_id: reversalId }).eq('id', order.id);
      }
    }
  } catch (err) {
    Sentry.captureException(err);
    // State so far is persisted — a retry resumes from the failed step.
    return NextResponse.json(
      {
        error: refundId
          ? 'Buyer refunded, but the artist payout reversal failed — RETRY to complete it.'
          : 'Refund failed at Stripe — safe to retry.',
      },
      { status: 502 }
    );
  }

  // Step 3 — close the order. CAS so concurrent settles resolve cleanly
  // (the Stripe idempotency keys already made their money ops no-ops).
  // The write is asserted: the money has moved at Stripe, so a close that
  // silently fails leaves a `paid` order the artist can still ship. Retry is
  // idempotent — both Stripe ids are on the row, so it skips to this step.
  const wasShipped = order.status === 'shipped' || order.status === 'delivered';
  const RETRY_CLOSE = 'Refund done at Stripe but the order could not be closed — retry.';
  const { data: closed, error: closeError } = await admin
    .from('orders')
    .update({ status: 'refunded' })
    .neq('status', 'refunded')
    .eq('id', order.id)
    .select('id')
    .maybeSingle();
  if (closeError || !closed) {
    Sentry.captureException(new Error(`Refund close failed on order ${order.id}: ${closeError?.message ?? 'zero rows'}`));
    return NextResponse.json({ error: RETRY_CLOSE }, { status: 502 });
  }

  // Relist ONLY a never-shipped piece — a shipped/delivered artwork is
  // physically with the buyer; the artist relists manually after return —
  // and only from `sold`: a listing the artist has since hidden stays hidden.
  // No OTHER order may hold the slot: the set matches
  // orders_one_live_per_listing (00055) — a disputed order holds it too.
  if (order.listing_id && !wasShipped) {
    const { count, error: countError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', order.listing_id)
      .in('status', ['paid', 'shipped', 'delivered', 'disputed'])
      .neq('id', order.id);
    if (countError) {
      Sentry.captureException(new Error(`Relist check failed for listing ${order.listing_id}: ${countError.message}`));
      return NextResponse.json({ error: RETRY_CLOSE }, { status: 502 });
    }
    if ((count ?? 0) === 0) {
      const { data: relisted, error: relistError } = await admin
        .from('listings')
        .update({ status: 'available', sold_price_cents: null })
        .eq('id', order.listing_id)
        .eq('status', 'sold')
        .select('id')
        .maybeSingle();
      if (relistError) {
        Sentry.captureException(new Error(`Relist of ${order.listing_id} failed after refund: ${relistError.message}`));
        return NextResponse.json({ error: RETRY_CLOSE }, { status: 502 });
      }
      // Zero rows is legitimate here: the listing is not `sold` any more
      // (the artist hid it, or a retry already relisted it) — that is the
      // "stays hidden" rule above, not a refused write.
      if (!relisted) {
        Sentry.captureMessage(`Refund on order ${order.id}: listing ${order.listing_id} not relisted (no longer 'sold').`, 'info');
      }
    }
  }

  return NextResponse.json({
    ok: true,
    refunded_cents: refundAmount,
    tax_refunded_cents: refundTax,
    payout_reversed_cents: reversalId ? order.artist_payout_cents : 0,
  });
}
