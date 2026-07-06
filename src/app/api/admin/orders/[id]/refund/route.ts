import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

// Admin settles an artist-approved refund. Policy (decided 2026-07-06):
// the buyer gets the artwork price + shipping back; the service fee is
// NEVER refunded; the artist returns their full payout (85% + shipping);
// the platform returns its 15% commission. The transfer reversal is
// computed explicitly — Stripe's proportional reverse_transfer would make
// the artist bear part of the fee/tax, which is not the deal.
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
    .select('id, status, stripe_payment_intent_id, amount_cents, shipping_cents, artist_payout_cents, listing_id')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 });

  const stripe = getStripe();
  const refundAmount = order.amount_cents + order.shipping_cents;

  try {
    // Find the destination transfer so the artist's payout can be reversed
    // exactly, independent of the refund amount.
    const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
      expand: ['latest_charge'],
    });
    const charge = pi.latest_charge as Stripe.Charge | null;

    await stripe.refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount: refundAmount,
      reverse_transfer: false,
      metadata: { policy_refund: 'true', order_id: order.id, ...(reason ? { admin_reason: reason } : {}) },
    });

    if (charge?.transfer) {
      await stripe.transfers.createReversal(
        typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id,
        { amount: order.artist_payout_cents }
      );
    }
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Refund failed at Stripe' }, { status: 502 });
  }

  // Policy refunds are partial by design (fee + tax stay), so the webhook's
  // full-refund path won't fire — settle the order state here.
  await admin.from('orders').update({ status: 'refunded' }).eq('id', order.id);
  if (order.listing_id) {
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', order.listing_id)
      .in('status', ['paid', 'shipped', 'delivered'])
      .neq('id', order.id);
    if ((count ?? 0) === 0) {
      await admin.from('listings').update({ status: 'available' }).eq('id', order.listing_id);
    }
  }

  return NextResponse.json({ ok: true, refunded_cents: refundAmount });
}
