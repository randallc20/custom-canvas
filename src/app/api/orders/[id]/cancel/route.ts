import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getStripe } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Buyer-initiated cancel — allowed only before shipment (status 'paid').
// Issues a full Stripe refund + transfer reversal; the charge.refunded webhook
// reconciles the order/listing state.
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: order } = await supabase
    .from('orders')
    .select('id, buyer_id, status, stripe_payment_intent_id, listing_id')
    .eq('id', params.id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.buyer_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (order.status !== 'paid') {
    return NextResponse.json({ error: 'This order can no longer be cancelled.' }, { status: 400 });
  }

  // Claim the cancel first (service role; the column guard blocks buyers from
  // writing 'refunded' directly) so a double-click can't issue two refunds.
  const admin = createAdminSupabaseClient();
  const { data: claimed } = await admin
    .from('orders')
    .update({ status: 'refunded' })
    .eq('id', order.id)
    .eq('status', 'paid')
    .select('id')
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: 'This order is already being cancelled.' }, { status: 409 });

  try {
    await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      reverse_transfer: true,
    });
  } catch (err) {
    // Roll back the claim so the buyer can retry.
    await admin.from('orders').update({ status: 'paid' }).eq('id', order.id);
    Sentry.captureException(err);
    return NextResponse.json({ error: 'Refund failed. Please contact support.' }, { status: 502 });
  }

  // Return the piece to the market (the charge.refunded webhook is idempotent).
  if (order.listing_id) {
    await admin.from('listings').update({ status: 'available', sold_price_cents: null }).eq('id', order.listing_id);
  }

  return NextResponse.json({ ok: true });
}
