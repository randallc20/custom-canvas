import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';

// Buyer-initiated cancel — allowed only before shipment (status 'paid').
// Issues a full Stripe refund + transfer reversal; the charge.refunded webhook
// reconciles the order/listing state.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, buyer_id, status, stripe_payment_intent_id')
    .eq('id', params.id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.buyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'This order can no longer be cancelled.' }, { status: 400 });
  }

  try {
    await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      reverse_transfer: true,
    });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Refund failed. Please contact support.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
