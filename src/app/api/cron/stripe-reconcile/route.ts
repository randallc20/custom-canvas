import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { diffPaymentAgainstOrder, Mismatch, ReconcileOrder } from '@/utils/reconcileStripe';

const SEVEN_DAYS_S = 7 * 24 * 60 * 60;
const ORDER_LOOKUP_CHUNK = 100;

// Daily: list every succeeded Stripe payment from the last 7 days and diff it
// against `orders` (04-P2). The webhook is at-least-once and retries, but a
// retry window can still expire; this is the safety net that notices a
// payment with no row, a refund or dispute Stripe knows about and we do not,
// and a row marked refunded that Stripe never refunded.
//
// READ-ONLY against orders/listings. The only writes are admin notifications.
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  const supabase = createAdminSupabaseClient();
  const since = Math.floor(Date.now() / 1000) - SEVEN_DAYS_S;

  // Succeeded PIs with their latest charge expanded.
  const payments: Stripe.PaymentIntent[] = [];
  for await (const pi of stripe.paymentIntents.list({
    created: { gte: since },
    limit: 100,
    expand: ['data.latest_charge'],
  })) {
    if (pi.status === 'succeeded') payments.push(pi);
  }

  // One `orders` lookup covers both a real order and the oversell audit row:
  // the webhook records an oversold payment as a 'refunded' orders row under
  // the same payment intent.
  const ordersByPi = new Map<string, ReconcileOrder>();
  const ids = payments.map((p) => p.id);
  for (let i = 0; i < ids.length; i += ORDER_LOOKUP_CHUNK) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, stripe_payment_intent_id, stripe_refund_id, stripe_reversal_id, dispute_id, dispute_outcome')
      .in('stripe_payment_intent_id', ids.slice(i, i + ORDER_LOOKUP_CHUNK));
    if (error) {
      Sentry.captureException(new Error(`stripe-reconcile: orders lookup failed: ${error.message}`));
      return NextResponse.json({ error: 'Orders lookup failed' }, { status: 500 });
    }
    for (const row of data ?? []) {
      if (row.stripe_payment_intent_id) ordersByPi.set(row.stripe_payment_intent_id, row as ReconcileOrder);
    }
  }

  const mismatches: Mismatch[] = [];
  for (const pi of payments) {
    const stripeCharge =
      pi.latest_charge && typeof pi.latest_charge === 'object' ? (pi.latest_charge as Stripe.Charge) : null;
    // The charge carries only a `disputed` flag under this API version; the
    // diff needs the dispute's status (open / won / lost / inquiry), so fetch
    // it for the rare disputed charge. Newest first, so [0] is the live one.
    let dispute: { id: string; status: string } | null = null;
    if (stripeCharge?.disputed) {
      const list = await stripe.disputes.list({ payment_intent: pi.id, limit: 1 });
      dispute = list.data[0] ? { id: list.data[0].id, status: list.data[0].status } : null;
    }
    const charge = stripeCharge ? { ...stripeCharge, dispute } : null;
    mismatches.push(...diffPaymentAgainstOrder(pi, charge, ordersByPi.get(pi.id) ?? null));
  }

  if (mismatches.length === 0) {
    return NextResponse.json({ ok: true, checked: payments.length, mismatches: 0 });
  }

  // One alert per run: a batch notification to every admin plus a Sentry
  // message carrying the full detail. The runbook ("Stripe reconcile cron")
  // says what to do with it.
  const counts = new Map<string, number>();
  for (const m of mismatches) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const summary = Array.from(counts.entries()).map(([kind, n]) => `${n}× ${kind}`).join(', ');
  const piList = Array.from(new Set(mismatches.map((m) => m.paymentIntentId)));
  const piPreview = piList.slice(0, 10).join(', ') + (piList.length > 10 ? ` … +${piList.length - 10} more` : '');

  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  if (admins?.length) {
    const { error: notifError } = await supabase.from('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'refund_approved',
        title: 'Stripe reconcile found mismatches',
        body: `${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'} across ${payments.length} payments (last 7 days): ${summary}. Payments: ${piPreview}. See the runbook.`,
        link: '/admin/orders',
      }))
    );
    if (notifError) {
      Sentry.captureException(new Error(`stripe-reconcile: admin notification insert failed: ${notifError.message}`));
    }
  }

  Sentry.captureMessage(
    `Stripe reconcile: ${mismatches.length} mismatch(es) across ${payments.length} payments — ${summary}\n` +
      mismatches.map((m) => `- ${m.kind} ${m.paymentIntentId} order=${m.orderId ?? 'none'}: ${m.detail}`).join('\n'),
    'error'
  );

  return NextResponse.json({ ok: true, checked: payments.length, mismatches: mismatches.length, items: mismatches });
}
