import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';

// Admin refund (full or partial) for dispute resolution.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { amountCents, reason } = await request.json();

  const admin = createAdminSupabaseClient();
  const { data: order } = await admin
    .from('orders')
    .select('id, status, stripe_payment_intent_id, amount_cents, buyer_fee_cents, shipping_cents')
    .eq('id', params.id)
    .single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 });

  const fullAmount = order.amount_cents + order.buyer_fee_cents + order.shipping_cents;
  // A partial amount at or above the order total is almost always a
  // dollars-vs-cents slip — reject it instead of silently escalating to a
  // full refund with a full transfer reversal. (Full refund = omit amount.)
  if (amountCents != null && (amountCents <= 0 || amountCents >= fullAmount)) {
    return NextResponse.json(
      { error: `Partial refund must be between 1 and ${fullAmount - 1} cents; omit amount for a full refund.` },
      { status: 400 }
    );
  }
  const refundAmount = amountCents ?? undefined;

  try {
    await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      reverse_transfer: true,
      ...(refundAmount ? { amount: refundAmount } : {}),
      ...(reason ? { metadata: { admin_reason: reason } } : {}),
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Refund failed at Stripe' }, { status: 502 });
  }

  // The charge.refunded webhook flips order/listing state and emails both parties.
  return NextResponse.json({ ok: true, partial: !!refundAmount });
}
