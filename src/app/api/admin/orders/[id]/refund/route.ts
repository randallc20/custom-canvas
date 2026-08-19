import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

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

  const { reason } = await request.json().catch(() => ({}));

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, stripe_payment_intent_id, amount_cents, shipping_cents, buyer_fee_cents, amount_tax_cents, artist_payout_cents, listing_id, stripe_refund_id, stripe_reversal_id')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 });

  const stripe = getStripe();

  // Refund = price + shipping + the tax attributable to them. Tax was
  // charged on three lines (price, shipping, fee) at a uniform rate, so the
  // fee's share is proportional; the fee and its tax stay with the platform.
  const taxedBase = order.amount_cents + order.shipping_cents + order.buyer_fee_cents;
  const feeTax = taxedBase > 0
    ? Math.round((order.amount_tax_cents * order.buyer_fee_cents) / taxedBase)
    : 0;
  const refundTax = Math.max(0, order.amount_tax_cents - feeTax);
  const refundAmount = order.amount_cents + order.shipping_cents + refundTax;

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
          metadata: { policy_refund: 'true', order_id: order.id, ...(reason ? { admin_reason: reason } : {}) },
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
  const wasShipped = order.status === 'shipped' || order.status === 'delivered';
  await admin.from('orders').update({ status: 'refunded' }).neq('status', 'refunded').eq('id', order.id);

  // Relist ONLY a never-shipped piece — a shipped/delivered artwork is
  // physically with the buyer; the artist relists manually after return.
  if (order.listing_id && !wasShipped) {
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', order.listing_id)
      .in('status', ['paid', 'shipped', 'delivered'])
      .neq('id', order.id);
    if ((count ?? 0) === 0) {
      await admin
        .from('listings')
        .update({ status: 'available', sold_price_cents: null })
        .eq('id', order.listing_id);
    }
  }

  return NextResponse.json({
    ok: true,
    refunded_cents: refundAmount,
    tax_refunded_cents: refundTax,
    payout_reversed_cents: reversalId ? order.artist_payout_cents : 0,
  });
}
