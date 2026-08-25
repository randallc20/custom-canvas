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

      // Delayed payment methods (ACH etc.) fire session.completed with
      // payment_status 'unpaid' — funds don't exist yet. Card-only today,
      // but this is one dashboard toggle away from recording unpaid orders
      // as paid. Log and ignore; enable async_payment_succeeded handling
      // before ever turning such methods on.
      if (session.payment_status !== 'paid') {
        Sentry.captureMessage(
          `checkout.session.completed with payment_status=${session.payment_status} — ignored (${paymentIntentId})`,
          'warning'
        );
        break;
      }

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
      if (!listing) {
        // The listing row vanished between session creation and webhook
        // delivery (artist/admin deleted it). The buyer HAS been charged and
        // the artist transfer HAS been created, so acking 200 here stranded an
        // orphaned charge with no order, no emails and no alert. Be loud: 500
        // makes Stripe retry and pages the operator.
        Sentry.captureException(
          new Error(`Paid session ${paymentIntentId} for missing listing ${listingId} — orphaned charge`)
        );
        return NextResponse.json({ error: 'Listing missing for paid session' }, { status: 500 });
      }

      const artistObj = listing.artist as unknown as { id: string };
      const order = buildOrderRecord(
        {
          payment_intent: paymentIntentId,
          metadata: session.metadata,
          total_details: session.total_details,
          collected_information: session.collected_information,
        },
        artistObj.id
      );
      if (!order) {
        // Money metadata missing — never fabricate amounts and never ack a
        // paid session silently. 500 → Stripe retries and Sentry screams.
        Sentry.captureException(new Error(`Unbuildable order for paid session ${paymentIntentId}`));
        return NextResponse.json({ error: 'Order metadata missing' }, { status: 500 });
      }

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
            await getStripe().refunds.create(
              { payment_intent: paymentIntentId, reverse_transfer: true },
              { idempotencyKey: `oversell_${paymentIntentId}` }
            );
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
          inserted.id,
          artistProf?.display_name ?? 'a Custom Canvas artist'
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
        .select('id, listing_id, status, artist_payout_cents')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!order) break;
      if (order.status === 'refunded') break; // already reconciled

      const wasShipped = order.status === 'shipped' || order.status === 'delivered';

      // A dashboard-initiated full refund may have skipped the artist
      // transfer reversal (it's a checkbox an admin can forget). Verify and
      // alert loudly — the platform would otherwise eat the payout silently.
      if (order.artist_payout_cents > 0 && charge.transfer) {
        try {
          const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id;
          const transfer = await getStripe().transfers.retrieve(transferId);
          if ((transfer.amount_reversed ?? 0) === 0) {
            Sentry.captureMessage(
              `Full refund WITHOUT transfer reversal: order ${order.id} — artist keeps ${order.artist_payout_cents}¢. Reverse it in the Stripe dashboard.`,
              'error'
            );
            const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
            for (const a of admins ?? []) {
              await supabase.from('notifications').insert({
                user_id: a.id,
                type: 'refund_approved',
                title: 'Refund needs attention',
                body: 'A full refund was issued without reversing the artist payout — check Stripe.',
                link: '/admin/orders',
              });
            }
          }
        } catch (err) {
          Sentry.captureException(err);
        }
      }

      await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);

      // Return the piece to the market ONLY if (a) it was never shipped —
      // a delivered piece is physically with the buyer regardless of the
      // refund — and (b) no OTHER live order still holds it (protects the
      // legit buyer when an oversell refund arrives).
      if (order.listing_id && !wasShipped) {
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

    case 'charge.dispute.created': {
      // A card chargeback. The Artist Agreement (section 4) promises we handle
      // the dispute response and ask the artist promptly for shipping
      // evidence -- before this, no dispute event was handled at all, so that
      // promise had no implementation and a lost dispute silently debited the
      // platform while the artist kept their transfer.
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent as string | null;
      if (!paymentIntentId) break;

      const { data: order } = await supabase
        .from('orders')
        .select('id, status, artist_id, listing:listings(title)')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!order) break;
      if (order.status === 'disputed') break; // already recorded

      await supabase.from('orders').update({ status: 'disputed' }).eq('id', order.id);

      const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
      const { data: artistProf } = await supabase
        .from('artist_profiles')
        .select('profile_id')
        .eq('id', order.artist_id)
        .maybeSingle();

      const recipients: string[] = [];
      if (artistProf?.profile_id) recipients.push(artistProf.profile_id);
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      recipients.push(...(admins ?? []).map((a) => a.id));

      if (recipients.length) {
        await supabase.from('notifications').insert(
          recipients.map((uid) => ({
            user_id: uid,
            type: 'order_disputed',
            title: 'Payment disputed',
            body: `The buyer's bank opened a dispute on "${title}". Send any shipping or delivery evidence to support@customcanvas.shop right away — the response deadline is set by the bank.`,
            link: '/studio/sales',
          }))
        );
      }
      Sentry.captureMessage(
        `Dispute opened on order ${order.id} (${dispute.reason}) — respond in Stripe before the deadline.`,
        'error'
      );
      break;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent as string | null;
      if (!paymentIntentId) break;

      const { data: order } = await supabase
        .from('orders')
        .select('id, status, artist_payout_cents, delivered_at, stripe_reversal_id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (!order) break;

      if (dispute.status === 'lost') {
        // The bank took the money back from the platform. Claw the artist
        // payout back the same way a settled refund does -- exact amount,
        // idempotency-keyed, id persisted so a retry skips it. The piece is
        // deliberately NOT relisted: after a chargeback its physical
        // whereabouts is genuinely unclear, so that is an admin/artist call.
        if (order.artist_payout_cents > 0 && !order.stripe_reversal_id) {
          try {
            const charge = await getStripe().charges.retrieve(dispute.charge as string);
            if (charge.transfer) {
              const reversal = await getStripe().transfers.createReversal(
                typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id,
                { amount: order.artist_payout_cents },
                { idempotencyKey: `dispute_reversal_${order.id}` }
              );
              await supabase
                .from('orders')
                .update({ stripe_reversal_id: reversal.id })
                .eq('id', order.id);
            }
          } catch (err) {
            Sentry.captureException(err);
            // Non-2xx so Stripe retries: the payout must not stay un-clawed.
            return NextResponse.json({ error: 'Dispute reversal failed' }, { status: 500 });
          }
        }
        await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
        Sentry.captureMessage(`Dispute LOST on order ${order.id} — payout reversed.`, 'error');
      } else if (dispute.status === 'won') {
        // Money stays. Restore the pre-dispute state.
        await supabase
          .from('orders')
          .update({ status: order.delivered_at ? 'delivered' : 'paid' })
          .eq('id', order.id);
      }

      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      if (admins?.length) {
        await supabase.from('notifications').insert(
          admins.map((a) => ({
            user_id: a.id,
            type: 'order_disputed',
            title: `Dispute ${dispute.status}`,
            body: `The dispute on order ${order.id.slice(0, 8)} closed as ${dispute.status}.`,
            link: '/admin/orders',
          }))
        );
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
      // Destination charges: the artist never creates charges — the platform
      // does, then transfers. charges_enabled is therefore the WRONG signal
      // (it can be true with no bank attached, stranding money in a Stripe
      // balance). Ready means: transfers capability active AND a working
      // payout destination. Written unconditionally so an account that later
      // falls out of good standing flips back off and checkout blocks with
      // the clean "hasn't finished setting up payments" error instead of an
      // opaque transfer failure.
      const ready =
        account.payouts_enabled === true &&
        account.capabilities?.transfers === 'active';
      const { data: artistRow } = await supabase
        .from('artist_profiles')
        .update({ stripe_onboarded: ready })
        .eq('stripe_account_id', account.id)
        .select('id')
        .maybeSingle();
      if (artistRow) {
        // Onboarding affects the completeness score — refresh canonically.
        await supabase.rpc('refresh_completeness_score', { p_artist_id: artistRow.id });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
