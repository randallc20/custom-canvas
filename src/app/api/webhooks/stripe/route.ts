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

      // Claim the listing with a live order. The partial unique index
      // (one live order per listing) makes a concurrent second sale fail here.
      const { data: inserted, error: insertError } = await supabase
        .from('orders')
        .insert(order)
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          // Either a redelivery of this same payment (already recorded) or an
          // oversell (another live order holds this listing). Distinguish:
          const { data: samePayment } = await supabase
            .from('orders')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .maybeSingle();
          if (samePayment) break; // redelivery — already handled

          // Oversell: refund this buyer and reverse the artist transfer.
          try {
            await getStripe().refunds.create({ payment_intent: paymentIntentId, reverse_transfer: true });
          } catch (refundErr) {
            Sentry.captureException(refundErr);
          }
          // Record the refunded order for the buyer's history / audit trail.
          await supabase.from('orders').insert({ ...order, status: 'refunded' });
          Sentry.captureMessage(
            `Oversell auto-refunded: listing ${listingId}, payment ${paymentIntentId}`,
            'warning'
          );
          break;
        }
        Sentry.captureException(new Error(`Order insert failed for ${paymentIntentId}: ${insertError.message}`));
        // Non-2xx makes Stripe retry — the order must not be silently lost.
        return NextResponse.json({ error: 'Order insert failed' }, { status: 500 });
      }
      if (!inserted) break;

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
          inserted.id
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

    case 'charge.refunded': {
      // Refund issued (admin dispute resolution, or our oversell auto-refund).
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent as string | null;
      if (!paymentIntentId) break;

      const { data: order } = await supabase
        .from('orders')
        .select('id, listing_id, status')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!order) break;
      if (order.status === 'refunded') break; // already reconciled

      await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);

      // Return the piece to the market only if no OTHER live order still holds
      // it (protects the legit buyer when an oversell refund arrives).
      if (order.listing_id) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', order.listing_id)
          .in('status', ['paid', 'shipped', 'delivered'])
          .neq('id', order.id);
        if ((count ?? 0) === 0) {
          await supabase
            .from('listings')
            .update({ status: 'available', sold_price_cents: null })
            .eq('id', order.listing_id);
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      // Card checkouts never create a session on failure, so there's usually
      // no order to touch; record a breadcrumb for async-payment edge cases.
      const pi = event.data.object;
      Sentry.captureMessage(`payment_intent.payment_failed: ${pi.id}`, 'info');
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
