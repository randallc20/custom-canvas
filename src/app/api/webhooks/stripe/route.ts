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
            // Do NOT ack: Stripe retries the event, the insert 23505s again,
            // and we re-attempt the refund. Acking here would record a
            // "refunded" order for money the buyer never got back.
            return NextResponse.json({ error: 'Oversell refund failed' }, { status: 500 });
          }
          // Record the refunded order for the buyer's history / audit trail.
          const { error: auditError } = await supabase.from('orders').insert({ ...order, status: 'refunded' });
          if (auditError) {
            Sentry.captureException(
              new Error(`Oversell audit insert failed for ${paymentIntentId}: ${auditError.message}`)
            );
          }
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
        supabase.from('artist_profiles').select('display_name, profile_id, profile:profiles!artist_profiles_profile_id_fkey(email)').eq('id', artistObj.id).single(),
      ]);

      // Local pickup: open/find the buyer↔artist thread and post a system
      // note so they can coordinate handoff.
      if (session.metadata?.pickup === 'true' && artistProf?.profile_id) {
        const artistUserId = artistProf.profile_id as string;
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .or(`and(participant_one.eq.${order.buyer_id},participant_two.eq.${artistUserId}),and(participant_one.eq.${artistUserId},participant_two.eq.${order.buyer_id})`)
          .limit(1)
          .maybeSingle();
        let convId = existingConv?.id;
        if (!convId) {
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({ participant_one: order.buyer_id, participant_two: artistUserId, context_type: 'listing', context_id: listingId })
            .select('id')
            .single();
          convId = newConv?.id;
        }
        if (convId) {
          await supabase.from('messages').insert({
            conversation_id: convId,
            sender_id: artistUserId,
            content: `Order for "${listing.title}" is ready to coordinate for local pickup.`,
            message_type: 'system',
          });
          await supabase.from('conversations').update({ last_message_text: 'Pickup coordination', last_message_at: new Date().toISOString() }).eq('id', convId);
        }
      }

      if (buyer?.email) {
        sendOrderConfirmationEmail(
          buyer.email,
          buyer.full_name ?? 'Collector',
          listing.title,
          formatPrice(session.amount_total ?? (order.amount_cents + order.buyer_fee_cents + order.shipping_cents)),
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

      // In-app sale notification — the 'new_order' type existed but was
      // never wired here (artists only got the email + Studio queue).
      if (artistProf?.profile_id) {
        await supabase.from('notifications').insert({
          user_id: artistProf.profile_id,
          type: 'new_order',
          title: 'New sale',
          body: `"${listing.title}" just sold for ${formatPrice(order.amount_cents)}.`,
          link: '/studio/sales',
        });
      }
      break;
    }

    case 'charge.refunded': {
      // Refund issued (admin dispute resolution, or our oversell auto-refund).
      // Stripe fires this for PARTIAL refunds too — only a full refund closes
      // the order and returns the piece to market.
      const charge = event.data.object;
      const paymentIntentId = charge.payment_intent as string | null;
      if (!paymentIntentId) break;
      if (charge.amount_refunded < charge.amount) break;

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
