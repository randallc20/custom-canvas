import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getStripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { buildOrderRecord } from '@/utils/orderRecord';
import { sendOrderConfirmationEmail, sendNewSaleEmail } from '@/services/email';
import { formatPrice } from '@/utils/formatPrice';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Webhooks carry no user session — the cookie client would be blocked by RLS.
  const supabase = createAdminSupabaseClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const listingId = session.metadata?.listing_id;
      const paymentIntentId = session.payment_intent as string | null;

      if (!listingId || !paymentIntentId) break;

      // Stripe delivers at-least-once: bail out if this payment was already
      // recorded (also enforced by the DB unique constraint below).
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (existingOrder) break;

      const { data: listing } = await supabase
        .from('listings')
        .select('*, artist:artist_profiles(id)')
        .eq('id', listingId)
        .single();
      if (!listing) break;

      const artistObj = listing.artist as unknown as { id: string };
      const order = buildOrderRecord(
        { payment_intent: paymentIntentId, metadata: session.metadata },
        listing,
        artistObj.id
      );
      if (!order) break;

      // Oversell: a second buyer completed a session opened before the first
      // sale closed. Record the payment (it happened) but alert for refund.
      const oversold = listing.status === 'sold';

      const { error: insertError } = await supabase.from('orders').insert(order);
      if (insertError) {
        if (insertError.code === '23505') break; // raced with a duplicate delivery
        Sentry.captureException(new Error(`Order insert failed for ${paymentIntentId}: ${insertError.message}`));
        // Non-2xx makes Stripe retry — the order must not be silently lost.
        return NextResponse.json({ error: 'Order insert failed' }, { status: 500 });
      }

      if (oversold) {
        Sentry.captureMessage(
          `Oversell: listing ${listingId} sold twice — payment ${paymentIntentId} needs a refund`,
          'error'
        );
        break;
      }

      await supabase
        .from('listings')
        .update({ status: 'sold', sold_price_cents: order.amount_cents })
        .eq('id', listingId);

      const [{ data: buyer }, { data: artistProf }] = await Promise.all([
        supabase.from('profiles').select('email, full_name').eq('id', order.buyer_id).single(),
        supabase.from('artist_profiles').select('display_name, profile:profiles(email)').eq('id', artistObj.id).single(),
      ]);

      if (buyer?.email) {
        sendOrderConfirmationEmail(
          buyer.email,
          buyer.full_name ?? 'Collector',
          listing.title,
          formatPrice(order.amount_cents + order.buyer_fee_cents + order.shipping_cents),
          listing.id
        ).catch(() => {});
      }

      const artistEmail = (artistProf?.profile as unknown as { email: string } | null)?.email;
      if (artistProf && artistEmail) {
        sendNewSaleEmail(
          artistEmail,
          artistProf.display_name,
          listing.title,
          formatPrice(order.amount_cents),
          formatPrice(order.artist_payout_cents)
        ).catch(() => {});
      }
      break;
    }

    case 'account.updated': {
      const account = event.data.object;
      if (account.charges_enabled) {
        const { data: artistRow } = await supabase
          .from('artist_profiles')
          .update({ stripe_onboarded: true })
          .eq('stripe_account_id', account.id)
          .select('id')
          .maybeSingle();
        if (artistRow) {
          // Onboarding affects the completeness score — refresh canonically.
          await supabase.rpc('refresh_completeness_score', { p_artist_id: artistRow.id });
        }
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
