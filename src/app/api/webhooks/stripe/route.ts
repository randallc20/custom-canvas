import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import type Stripe from 'stripe';
import { getStripe, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET } from '@/lib/stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { buildOrderRecord, detachParty, partyFromForeignKeyError } from '@/utils/orderRecord';
import {
  pickupHandoffConfirmed,
  evaluateProtection,
  ProtectionInput,
  REPLY_WINDOW_BUSINESS_DAYS,
} from '@/utils/evaluateProtection';
import { artistRepliedInTime } from '@/utils/artistRepliedInTime';
import { selectDisputeOpenAction, selectDisputeCloseOutcome } from '@/utils/disputeOutcome';
import { sendOrderConfirmationEmail, sendNewSaleEmail, sendOversoldRefundEmail } from '@/services/email';
import { formatPrice } from '@/utils/formatPrice';


type AdminClient = ReturnType<typeof createAdminSupabaseClient>;
type OrderRecord = NonNullable<ReturnType<typeof buildOrderRecord>>;

/** Non-2xx so Stripe redelivers. 500 = our write failed; 409 = the row this
 *  event belongs to does not exist YET (retry after checkout.session.completed
 *  has created it). Every state write in this file goes through here on
 *  failure — a 200 over a failed write is an event Stripe never resends. */
function retryLater(message: string, status: 500 | 409 = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Requirement 6 needs the message history. Conversations are keyed by the
// participant pair, not by order or listing (findOrCreateConversation matches
// on participants only, and the pickup branch below reuses any thread between
// the two), so the buyer<->artist thread is found the same way here. Only
// messages written after the order exists count; the rule itself lives in
// utils/artistRepliedInTime so the money tests can pin it. Read failures
// degrade to "replied" — the lenient direction.
async function artistRepliedInTimeForOrder(
  supabase: AdminClient,
  order: { buyer_id: string | null; artist_id: string | null; created_at: string }
): Promise<boolean> {
  // Either party may be NULL once their account is deleted (00049): their
  // thread cascaded away with them, so there is nothing to judge.
  if (!order.buyer_id || !order.artist_id) return true;
  const { data: artist } = await supabase
    .from('artist_profiles').select('profile_id').eq('id', order.artist_id).maybeSingle();
  const artistUserId = artist?.profile_id as string | undefined;
  if (!artistUserId) return true;

  const { data: convos } = await supabase
    .from('conversations')
    .select('id')
    .or(`and(participant_one.eq.${order.buyer_id},participant_two.eq.${artistUserId}),and(participant_one.eq.${artistUserId},participant_two.eq.${order.buyer_id})`);
  const convoIds = (convos ?? []).map((c) => c.id as string);
  if (!convoIds.length) return true;

  const { data: msgs } = await supabase
    .from('messages')
    .select('sender_id, created_at')
    .in('conversation_id', convoIds)
    .gt('created_at', order.created_at)
    .order('created_at', { ascending: true });

  return artistRepliedInTime((msgs ?? []) as { sender_id: string; created_at: string }[], {
    buyerId: order.buyer_id,
    artistUserId,
    orderCreatedAt: order.created_at,
    windowBusinessDays: REPLY_WINDOW_BUSINESS_DAYS,
  });
}

async function assessProtection(supabase: AdminClient, orderId: string) {
  const { data: o } = await supabase
    .from('orders')
    .select('id, listing_id, buyer_id, artist_id, created_at, shipped_at, delivered_at, tracking_number, carrier, signature_required, signature_confirmed, evidence_photo_count, evidence_has_condition_notes, fulfillment_window_days, is_pickup, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at')
    .eq('id', orderId)
    .single();
  if (!o) return null;

  // Persisted at checkout (00041) — never inferred from a missing address,
  // which would route shipped orders down the easier pickup branch.
  const isPickup = !!o.is_pickup;

  const input: ProtectionInput = {
    isPickup,
    pickupHandoffConfirmed: pickupHandoffConfirmed(o as Parameters<typeof pickupHandoffConfirmed>[0]),
    createdAt: o.created_at as string,
    shippedAt: o.shipped_at as string | null,
    deliveredAt: o.delivered_at as string | null,
    trackingNumber: o.tracking_number as string | null,
    carrier: o.carrier as string | null,
    signatureRequired: !!o.signature_required,
    signatureConfirmed: !!o.signature_confirmed,
    evidencePhotoCount: (o.evidence_photo_count as number) ?? 0,
    evidenceHasConditionNotes: !!o.evidence_has_condition_notes,
    fulfillmentWindowDays: (o.fulfillment_window_days as number) ?? 5,
    artistRepliedWithinWindow: await artistRepliedInTimeForOrder(supabase, {
      buyer_id: o.buyer_id as string | null,
      artist_id: o.artist_id as string | null,
      created_at: o.created_at as string,
    }),
  };
  return evaluateProtection(input);
}

async function adminIds(supabase: AdminClient): Promise<string[]> {
  const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
  return (admins ?? []).map((a) => a.id as string);
}

// Everything that follows a successful order insert: the listing leaves the
// market, the parties are emailed, the artist gets the in-app sale. Factored
// out because a redelivery must be able to RESUME it — a first delivery that
// died between the insert and these steps (function timeout) used to leave
// the listing available and nobody emailed, and the retry short-circuited on
// "already recorded". Returns a response only on a failure Stripe must retry.
//
// Any of the order's three parties may be NULL (01-r2 P2): the buyer deleted
// their account with the Checkout tab still open, or the artist did and the
// listing cascaded away. The money moved regardless, so the order is
// recorded and the steps that need the missing party are skipped — and the
// admins and Sentry are told, because somebody was paid or charged with
// nobody on the other end to notify.
async function completeSale(
  supabase: AdminClient,
  args: {
    session: Stripe.Checkout.Session;
    listingTitle: string;
    order: OrderRecord;
    orderId: string;
  }
): Promise<NextResponse | null> {
  const { session, listingTitle, order, orderId } = args;
  const { listing_id: listingId, buyer_id: buyerId, artist_id: artistId } = order;

  if (listingId) {
    const { error: soldError } = await supabase
      .from('listings')
      .update({ status: 'sold', sold_price_cents: order.amount_cents })
      .eq('id', listingId);
    if (soldError) {
      Sentry.captureException(new Error(`Listing ${listingId} sold-update failed for order ${orderId}: ${soldError.message}`));
      return retryLater('Listing sold-update failed');
    }
  }

  const buyer = buyerId
    ? (await supabase.from('profiles').select('email, full_name').eq('id', buyerId).maybeSingle()).data
    : null;
  const artistProf = artistId
    ? (await supabase
        .from('artist_profiles')
        .select('display_name, profile_id, profile:profiles!artist_profiles_profile_id_fkey(email)')
        .eq('id', artistId)
        .maybeSingle()).data
    : null;

  // Local pickup: open/find the buyer↔artist thread and post a system
  // note so they can coordinate handoff. Needs both people.
  if (session.metadata?.pickup === 'true' && buyerId && artistProf?.profile_id) {
    const artistUserId = artistProf.profile_id as string;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .or(`and(participant_one.eq.${buyerId},participant_two.eq.${artistUserId}),and(participant_one.eq.${artistUserId},participant_two.eq.${buyerId})`)
      .limit(1)
      .maybeSingle();
    let convId = existingConv?.id;
    if (!convId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({ participant_one: buyerId, participant_two: artistUserId, context_type: 'listing', context_id: listingId })
        .select('id')
        .single();
      convId = newConv?.id;
    }
    if (convId) {
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: artistUserId,
        content: `Order for "${listingTitle}" is ready to coordinate for local pickup.`,
        message_type: 'system',
      });
      await supabase.from('conversations').update({ last_message_text: 'Pickup coordination', last_message_at: new Date().toISOString() }).eq('id', convId);
    }
  }

  if (buyer?.email) {
    sendOrderConfirmationEmail(
      buyer.email,
      buyer.full_name ?? 'Collector',
      listingTitle,
      formatPrice(session.amount_total ?? (order.amount_cents + order.buyer_fee_cents + order.shipping_cents)),
      orderId,
      artistProf?.display_name ?? 'a Custom Canvas artist'
    ).catch((e) => Sentry.captureException(e));
  }

  const artistEmail = (artistProf?.profile as unknown as { email: string } | null)?.email;
  if (artistProf && artistEmail) {
    sendNewSaleEmail(
      artistEmail,
      artistProf.display_name,
      listingTitle,
      formatPrice(order.amount_cents),
      formatPrice(order.artist_payout_cents)
    ).catch((e) => Sentry.captureException(e));
  }

  // In-app sale notification — the 'new_order' type existed but was
  // never wired here (artists only got the email + Studio queue).
  if (artistProf?.profile_id) {
    await supabase.from('notifications').insert({
      user_id: artistProf.profile_id,
      type: 'new_order',
      title: 'New sale',
      body: `"${listingTitle}" just sold for ${formatPrice(order.amount_cents)}.`,
      link: '/studio/sales',
    });
  }

  // A deleted party: the payment is on the books, but the confirmation, the
  // sale email, or the listing's sold flag had nobody to land on. A deleted
  // ARTIST is the loud one — the destination transfer to their Connect
  // account has already happened.
  const missing = [
    !buyerId && 'buyer',
    !listingId && 'listing',
    !artistId && 'artist',
  ].filter(Boolean) as string[];
  if (missing.length) {
    const tail = artistId
      ? ''
      : ' The transfer to the artist\'s Connect account already happened — check the account in Stripe.';
    Sentry.captureMessage(
      `Payment ${order.stripe_payment_intent_id} recorded on order ${orderId} for a deleted ${missing.join(' + ')}.${tail}`,
      'error'
    );
    const rows = (await adminIds(supabase)).map((adminId) => ({
      user_id: adminId,
      type: 'refund_approved',
      title: 'Payment for a deleted account',
      body: `Order ${orderId.slice(0, 8)} was paid after its ${missing.join(' and ')} had been deleted (${formatPrice(order.amount_cents)}).${tail}`,
      link: '/admin/orders',
    }));
    if (rows.length) await supabase.from('notifications').insert(rows);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // Two endpoints deliver here and they sign with DIFFERENT secrets: the
  // account endpoint (payments, refunds, disputes) and the Connect endpoint
  // (account.updated for connected artist accounts). Try each; accept the one
  // that verifies. Previously only the account secret was tried, so every
  // connected-account event was rejected as an invalid signature and
  // stripe_onboarded — written nowhere else — never flipped. Artists
  // completed onboarding and checkout kept refusing them.
  const secrets = [STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  let event;
  for (const secret of secrets) {
    try {
      event = getStripe().webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
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

      const { data: listing } = await supabase
        .from('listings')
        .select('*, artist:artist_profiles(id)')
        .eq('id', listingId)
        .single();

      // Stripe delivers at-least-once. An already-recorded payment is a
      // redelivery — but if the listing is still on the market the first
      // delivery died before completeSale ran, so resume it (the listing's
      // status is the idempotent check: sold means the steps happened).
      // Only while the order is still `paid`: a settled refund, a lost
      // dispute or a manual relist also put the listing back on the market,
      // and resuming then would re-sell the piece and re-send every email.
      const resumeIfIncomplete = async (existing: { id: string; status: string }): Promise<NextResponse | null> => {
        if (existing.status !== 'paid') return null;
        const orderId = existing.id;
        const { data: fresh } = await supabase
          .from('listings').select('status').eq('id', listingId).single();
        if (!listing || fresh?.status !== 'available') return null;
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
        if (!order) return null;
        Sentry.captureMessage(`Resuming post-insert steps for order ${orderId} (${paymentIntentId})`, 'warning');
        return completeSale(supabase, { session, listingTitle: listing.title, order, orderId });
      };

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (existingOrder) {
        const failed = await resumeIfIncomplete(existingOrder);
        if (failed) return failed;
        break;
      }

      // The listing row vanished between session creation and webhook
      // delivery: the artist deleted it, or deleted their account and it
      // cascaded away (01-r2 P2). The buyer HAS been charged and the artist
      // transfer HAS been created. Returning 500 here made Stripe retry into
      // the same missing row for three days and left no order for the
      // refund, the dispute handlers or the reconcile cron to attach to.
      // Record the order without the listing; the artist comes from the
      // session metadata if their row still exists, else the order is
      // detached from them too and completeSale says so loudly.
      let artistId: string | null = null;
      if (listing) {
        artistId = (listing.artist as unknown as { id: string }).id;
      } else {
        const metaArtist = session.metadata?.artist_id;
        if (metaArtist) {
          const { data: artistRow } = await supabase
            .from('artist_profiles').select('id').eq('id', metaArtist).maybeSingle();
          artistId = (artistRow?.id as string | undefined) ?? null;
        }
        Sentry.captureMessage(
          `Paid session ${paymentIntentId} for missing listing ${listingId} — recording the order without it`,
          'error'
        );
      }
      const listingTitle: string = listing?.title ?? 'an artwork (listing since removed)';

      let order = buildOrderRecord(
        {
          payment_intent: paymentIntentId,
          metadata: session.metadata,
          total_details: session.total_details,
          collected_information: session.collected_information,
        },
        artistId
      );
      if (!order) {
        // Money metadata missing — never fabricate amounts and never ack a
        // paid session silently. 500 → Stripe retries and Sentry screams.
        Sentry.captureException(new Error(`Unbuildable order for paid session ${paymentIntentId}`));
        return retryLater('Order metadata missing');
      }
      if (!listing) order = detachParty(order, 'listing_id');

      // Claim the listing with a live order. The partial unique index
      // (one live order per listing) makes a concurrent second sale fail here.
      //
      // A 23503 means a party's row is gone — the buyer deleted their
      // account while their Checkout tab was open (00049 made the columns
      // nullable for exactly this). Detach the party the constraint names
      // and insert again; the money columns and the payment intent stay.
      // Bounded: three parties, so at most three detachments.
      let inserted: { id: string } | null = null;
      let insertError: { code?: string; message: string; details?: string | null } | null = null;
      for (let attempt = 0; attempt <= 3; attempt++) {
        const result = await supabase.from('orders').insert(order).select('id').single();
        inserted = result.data;
        insertError = result.error;
        if (!insertError || insertError.code !== '23503') break;
        const party = partyFromForeignKeyError(insertError.message, insertError.details);
        if (!party || order[party] === null) break; // unknown FK, or already detached — a real retry
        Sentry.captureMessage(
          `Order insert for ${paymentIntentId} hit ${party} FK (${order[party]} is gone) — recording the order without it`,
          'warning'
        );
        order = detachParty(order, party);
      }

      if (insertError) {
        if (insertError.code === '23505') {
          // Either a redelivery of this same payment (already recorded) or an
          // oversell (another live order holds this listing). Distinguish:
          const { data: samePayment } = await supabase
            .from('orders')
            .select('id, status')
            .eq('stripe_payment_intent_id', paymentIntentId)
            .maybeSingle();
          if (samePayment) {
            const failed = await resumeIfIncomplete(samePayment);
            if (failed) return failed;
            break; // redelivery — already handled
          }

          // Oversell: refund this buyer and reverse the artist transfer.
          try {
            await getStripe().refunds.create(
              { payment_intent: paymentIntentId, reverse_transfer: true },
              { idempotencyKey: `oversell_${paymentIntentId}` }
            );
          } catch (refundErr) {
            // The idempotency key lives 24h. A `checkout.session.completed`
            // resent later than that (04-r3 appendix) mints a fresh attempt
            // that Stripe refuses because the money already went back — that
            // is success, not failure: carry on to the audit row.
            if ((refundErr as { code?: string }).code !== 'charge_already_refunded') {
              Sentry.captureException(refundErr);
              // Do NOT ack: Stripe retries the event, the insert 23505s again,
              // and we re-attempt the refund. Acking here would record a
              // "refunded" order for money the buyer never got back.
              return retryLater('Oversell refund failed');
            }
          }
          // Record the refunded order for the buyer's history / audit trail.
          // charge.refunded for this refund matches THIS row (409 until it
          // exists), so the refund event can never be dropped as an orphan.
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
          // The buyer landed on "Your purchase was successful!" and, until
          // now, learned of the refund only from a Refunded row a minute
          // later (04-r3 P2). Tell them, and tell admins — a Sentry warning
          // was the only signal that the piece is being resold repeatedly.
          // Notifications are best-effort: the money is already back.
          {
            const oversoldTitle = listing?.title ?? 'the piece';
            const paidCents = session.amount_total ?? (order.amount_cents + order.buyer_fee_cents + order.shipping_cents);
            const { data: oversoldBuyer } = await supabase
              .from('profiles').select('email, full_name').eq('id', order.buyer_id).maybeSingle();
            if (oversoldBuyer?.email) {
              sendOversoldRefundEmail(
                oversoldBuyer.email,
                oversoldBuyer.full_name ?? 'Collector',
                oversoldTitle,
                formatPrice(paidCents)
              ).catch((e) => Sentry.captureException(e));
            }
            const oversoldRows: Array<Record<string, string>> = [];
            // buyer_id is null when the buyer deleted their account mid-Checkout
            // (R14); the refund still happened, there is just nobody to notify.
            if (order.buyer_id) {
              oversoldRows.push({
                user_id: order.buyer_id,
                type: 'refund_approved',
                title: 'Refunded: sold moments before your payment',
                body: `"${oversoldTitle}" was sold to another collector moments before your payment went through. You have been refunded in full (${formatPrice(paidCents)}); it can take a few days to show on your statement.`,
                link: '/orders',
              });
            }
            for (const adminId of await adminIds(supabase)) {
              oversoldRows.push({
                user_id: adminId,
                type: 'refund_approved',
                title: 'Oversold listing auto-refunded',
                body: `"${oversoldTitle}" took a second payment while an order already held it; the buyer was refunded in full (${formatPrice(paidCents)}, Stripe keeps its fee). If the listing is still available, check why it went back on sale.`,
                link: '/admin/orders',
              });
            }
            const { error: oversoldNotifError } = await supabase.from('notifications').insert(oversoldRows);
            if (oversoldNotifError) {
              Sentry.captureException(new Error(`Oversell notifications failed for ${paymentIntentId}: ${oversoldNotifError.message}`));
            }
          }
          break;
        }
        Sentry.captureException(new Error(`Order insert failed for ${paymentIntentId}: ${insertError.message}`));
        // Non-2xx makes Stripe retry — the order must not be silently lost.
        return retryLater('Order insert failed');
      }
      if (!inserted) break;

      const failed = await completeSale(supabase, { session, listingTitle, order, orderId: inserted.id });
      if (failed) return failed;
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
      if (!order) {
        // No order (and no oversell audit row — that is an orders row too)
        // for this payment yet: events retry independently, so the refund
        // can outrun checkout.session.completed during an outage. Acking
        // would drop it and leave a refunded sale recorded as paid.
        return retryLater(`No order for refunded payment ${paymentIntentId} yet`, 409);
      }
      if (order.status === 'refunded') break; // already reconciled

      const wasShipped = order.status === 'shipped' || order.status === 'delivered';

      // A dashboard-initiated full refund may have skipped the artist
      // transfer reversal (it's a checkbox an admin can forget), or reversed
      // only part of it (04-r3 appendix). Verify and alert loudly — the
      // platform would otherwise eat the remainder silently.
      if (order.artist_payout_cents > 0 && charge.transfer) {
        try {
          const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id;
          const transfer = await getStripe().transfers.retrieve(transferId);
          const reversed = transfer.amount_reversed ?? 0;
          if (reversed < order.artist_payout_cents) {
            const kept = order.artist_payout_cents - reversed;
            Sentry.captureMessage(
              `Full refund with ${reversed === 0 ? 'NO' : 'only a PARTIAL'} transfer reversal: order ${order.id} — artist keeps ${kept}¢ of ${order.artist_payout_cents}¢. Reverse the rest in the Stripe dashboard.`,
              'error'
            );
            for (const adminId of await adminIds(supabase)) {
              await supabase.from('notifications').insert({
                user_id: adminId,
                type: 'refund_approved',
                title: 'Refund needs attention',
                body: `A full refund was issued but ${formatPrice(kept)} of the artist payout was not reversed — check Stripe.`,
                link: '/admin/orders',
              });
            }
          }
        } catch (err) {
          Sentry.captureException(err);
        }
      }

      const { error: refundedError } = await supabase.from('orders').update({ status: 'refunded' }).eq('id', order.id);
      if (refundedError) {
        Sentry.captureException(new Error(`Order ${order.id} refunded-update failed: ${refundedError.message}`));
        return retryLater('Order refunded-update failed');
      }

      // Return the piece to the market ONLY if (a) it was never shipped —
      // a delivered piece is physically with the buyer regardless of the
      // refund — (b) no OTHER live order still holds it (protects the
      // legit buyer when an oversell refund arrives; the set matches
      // orders_one_live_per_listing, 00055 — a disputed order holds the
      // slot too), and (c) it is still `sold`: an artist who hid the
      // listing in the meantime keeps it hidden.
      if (order.listing_id && !wasShipped) {
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', order.listing_id)
          .in('status', ['paid', 'shipped', 'delivered', 'disputed'])
          .neq('id', order.id);
        if ((count ?? 0) === 0) {
          const { error: relistError } = await supabase
            .from('listings')
            .update({ status: 'available', sold_price_cents: null })
            .eq('id', order.listing_id)
            .eq('status', 'sold');
          if (relistError) {
            Sentry.captureException(new Error(`Relist of ${order.listing_id} failed after refund: ${relistError.message}`));
            return retryLater('Relist failed');
          }
        }
      }
      break;
    }

    case 'charge.dispute.created':
    case 'charge.dispute.updated': {
      // A card chargeback — or a card-network INQUIRY, which Stripe delivers
      // through the same event with a `warning_*` status. The Artist
      // Agreement (section 4) promises we handle the dispute response and ask
      // the artist promptly for shipping evidence. Branch selection is pure
      // (utils/disputeOutcome) and tested; this block does the reads, writes
      // and notifications it names.
      //
      // `updated` is handled with the same logic because an inquiry that
      // escalates to a chargeback keeps its dispute id and arrives as
      // charge.dispute.updated with a non-warning status — the only moment
      // the order can be frozen. Redeliveries and evidence updates fall out
      // as 'already_recorded'.
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent as string | null;
      if (!paymentIntentId) break;

      // A failed read is a 500 (our side; retry now), not the 409 "no row
      // yet" answer: `.maybeSingle()` returns data null on an error too, and
      // calling that "no order" put a real order's event on Stripe's multi-day
      // retry schedule, to land long after the dispute had closed.
      const { data: order, error: orderReadError } = await supabase
        .from('orders')
        .select('id, status, artist_id, stripe_refund_id, dispute_id, dispute_status, dispute_outcome, listing:listings(title)')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (orderReadError) {
        Sentry.captureException(new Error(`Order read failed for disputed payment ${paymentIntentId}: ${orderReadError.message}`));
        return retryLater('Order read failed');
      }
      if (!order) return retryLater(`No order for disputed payment ${paymentIntentId} yet`, 409);

      // Includes an open event whose dispute is already over (won, lost,
      // warning_closed, charge_refunded): late, resent, or emitted alongside
      // `closed`, and — since the payload of an open event never changes —
      // a resent `created` for a dispute whose outcome is already on the
      // row. The closed handler owns those; re-freezing here would leave
      // the order `disputed` with no closing event ever coming.
      const action = selectDisputeOpenAction(order, { id: dispute.id, status: dispute.status });
      if (action === 'already_recorded') break;

      // Every branch below records what this id currently means (00057), so
      // the next event for it can be told from a duplicate.
      const disputeRecord = { dispute_id: dispute.id, dispute_status: dispute.status };
      const dueBy = dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;
      const deadlineLine = dueBy ? ` before ${dueBy}` : " before the bank's deadline";

      const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
      // artist_id is NULL once the artist's account is deleted (00049): the
      // order and its money logic carry on; only the artist's notification is
      // skipped, and loudly, so support knows nobody was told.
      const { data: artistProf } = order.artist_id
        ? await supabase
            .from('artist_profiles')
            .select('profile_id')
            .eq('id', order.artist_id)
            .maybeSingle()
        : { data: null };
      if (!order.artist_id) {
        Sentry.captureMessage(
          `Dispute opened on order ${order.id} whose artist account is deleted — no artist notification sent.`,
          'warning'
        );
      }

      const artistUserId = artistProf?.profile_id as string | undefined;
      // Artist and admins get different links: /studio is artist-gated, so an
      // admin sent there is bounced to the home page.
      const admins = await adminIds(supabase);
      const rows: Array<Record<string, string>> = [];

      if (action === 'inquiry') {
        // No funds have moved; the order is not frozen and protection is NOT
        // assessed — the artist can still ship/deliver, and an assessment now
        // would freeze a verdict on an order that may never be disputed.
        const { error } = await supabase.from('orders').update(disputeRecord).eq('id', order.id);
        if (error) {
          Sentry.captureException(new Error(`Inquiry ${dispute.id} record failed on order ${order.id}: ${error.message}`));
          return retryLater('Inquiry record failed');
        }
        if (artistUserId) {
          rows.push({
            user_id: artistUserId,
            type: 'order_disputed',
            title: 'Bank inquiry on a payment',
            body: `The buyer's bank is asking about the payment for "${title}". This is an inquiry, not a chargeback: no funds have moved and nothing changes on this order. If you have shipping or delivery evidence, send it to support@customcanvas.shop — answering early usually closes it before it becomes a dispute.`,
            link: '/studio/sales',
          });
        }
        for (const adminId of admins) {
          rows.push({
            user_id: adminId,
            type: 'order_disputed',
            title: 'Bank inquiry on a payment',
            body: `An inquiry (not a chargeback) was opened on "${title}" — the bank is asking about this payment; no funds have moved. Respond in the Stripe dashboard before its deadline.`,
            link: '/admin/orders',
          });
        }
        if (rows.length) await supabase.from('notifications').insert(rows);
        Sentry.captureMessage(`Inquiry opened on order ${order.id} (${dispute.reason}) — respond in Stripe.`, 'warning');
        break;
      }

      if (action === 'post_refund' || action === 'post_refund_escalated') {
        // A refund exists on this payment (admin settle or dashboard refund)
        // and the payout reversal, if any, is on the row. Freezing a
        // refunded order as `disputed` is what let a won dispute flip it
        // back to `paid`. Record the id and status, tell admins, leave the
        // status alone.
        //
        // The row does not store the refund amount, and "the money already
        // went back" was false for a partial refund or an earlier partial
        // loss (04-r3 P2): say what Stripe says was refunded. Copy only —
        // a failed read must not stop the notification.
        let refundedCents: number | null = null;
        try {
          const charge = await getStripe().charges.retrieve(dispute.charge as string);
          refundedCents = charge.amount_refunded;
        } catch (err) {
          Sentry.captureException(err);
        }
        const refundLine = refundedCents !== null
          ? `A refund of ${formatPrice(refundedCents)} exists on this payment`
          : 'A refund exists on this payment';

        const { error } = await supabase.from('orders').update(disputeRecord).eq('id', order.id);
        if (error) {
          Sentry.captureException(new Error(`Post-refund dispute ${dispute.id} record failed on order ${order.id}: ${error.message}`));
          return retryLater('Dispute record failed');
        }
        if (action === 'post_refund_escalated') {
          // The inquiry we recorded on this payment became a chargeback
          // after we refunded it (04-r3 P1). Unanswered, it is lost by
          // default and the buyer keeps the refund AND the chargeback.
          for (const adminId of admins) {
            rows.push({
              user_id: adminId,
              type: 'order_disputed',
              title: 'Inquiry escalated on a refunded payment',
              body: `The bank escalated its inquiry on "${title}" to a chargeback — on a payment we already refunded. ${refundLine}: respond in the Stripe dashboard with the refund as evidence${deadlineLine}, or the dispute is lost by default and the buyer keeps both.`,
              link: '/admin/orders',
            });
          }
          if (artistUserId) {
            rows.push({
              user_id: artistUserId,
              type: 'order_disputed',
              title: 'Bank inquiry became a chargeback',
              body: `The bank's inquiry about "${title}" has become a chargeback. This order was already refunded, so nothing further changes on it; Custom Canvas is responding to the bank with the refund as evidence.`,
              link: '/studio/sales',
            });
          }
          if (rows.length) await supabase.from('notifications').insert(rows);
          Sentry.captureMessage(
            `Inquiry ${dispute.id} ESCALATED to ${dispute.status} on already-refunded order ${order.id} (${dispute.reason}) — respond in Stripe${deadlineLine}.`,
            'error'
          );
          break;
        }
        for (const adminId of admins) {
          rows.push({
            user_id: adminId,
            type: 'order_disputed',
            title: 'Dispute on a refunded order',
            body: `A chargeback (${dispute.status}) is open on "${title}" after its refund. ${refundLine} — respond in the Stripe dashboard with the refund as evidence${deadlineLine}.`,
            link: '/admin/orders',
          });
        }
        if (rows.length) await supabase.from('notifications').insert(rows);
        Sentry.captureMessage(`Dispute ${dispute.id} (${dispute.status}) on already-refunded order ${order.id} (${dispute.reason}).`, 'error');
        break;
      }

      // Chargeback on a live order. Evaluate protection NOW, against the
      // evidence frozen at checkout plus what the artist actually did, and
      // persist it. The artist must never have to work out whether they are
      // covered. The pre-dispute status is saved in the same write so the
      // closed handler can put the order back exactly where it was.
      // A failed evidence read is a transient error (the row was read three
      // statements ago), never a verdict: coercing it to 'ineligible' froze
      // the worst case for good and reversed a compliant artist's payout
      // months later. Retry — the evidence is frozen, the answer will be the
      // same tomorrow.
      const assessment = await assessProtection(supabase, order.id);
      if (!assessment) return retryLater('Protection evidence read failed');
      const protectionStatus = assessment.status;

      const { data: frozen, error: freezeError } = await supabase
        .from('orders')
        .update({
          status: 'disputed',
          ...disputeRecord,
          protection_status: protectionStatus,
          pre_dispute_status: order.status,
        })
        .eq('id', order.id)
        .neq('status', 'disputed')
        .select('id')
        .maybeSingle();
      if (freezeError) {
        Sentry.captureException(new Error(`Dispute freeze failed on order ${order.id}: ${freezeError.message}`));
        return retryLater('Dispute freeze failed');
      }
      if (!frozen) break; // a concurrent delivery froze it first

      const covered = protectionStatus === 'protected';
      const artistLine = covered
        ? `Good news: this order was Protected, so Custom Canvas covers the loss — your payout is not affected.`
        : `This order was not Protected, so the amount will be deducted from your payout. Reasons: ${assessment.failures.join(' ')}`;

      if (artistUserId) {
        rows.push({
          user_id: artistUserId,
          type: 'order_disputed',
          title: 'Payment disputed',
          body: `${artistLine} A dispute was opened on "${title}". Send any shipping or delivery evidence to support@customcanvas.shop right away — the bank sets the response deadline.`,
          link: '/studio/sales',
        });
      }
      for (const adminId of admins) {
        rows.push({
          user_id: adminId,
          type: 'order_disputed',
          title: 'Payment disputed',
          body: `A dispute was opened on "${title}" — protection: ${protectionStatus}. Respond in the Stripe dashboard before the bank's deadline.`,
          link: '/admin/orders',
        });
      }
      if (rows.length) await supabase.from('notifications').insert(rows);
      Sentry.captureMessage(
        `Dispute opened on order ${order.id} (${dispute.reason}) — respond in Stripe before the deadline.`,
        'error'
      );
      break;
    }

    case 'charge.dispute.closed': {
      // Stripe closes a dispute as `lost`, `won`, or `warning_closed` (an
      // inquiry that never escalated). "Not lost" is the restore branch.
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent as string | null;
      if (!paymentIntentId) break;

      const CLOSE_COLUMNS =
        'id, status, artist_id, artist_payout_cents, shipped_at, delivered_at, stripe_refund_id, stripe_reversal_id, protection_status, pre_dispute_status, dispute_id, dispute_status, dispute_outcome, listing:listings(title)';
      const { data: firstRead, error: orderReadError } = await supabase
        .from('orders')
        .select(CLOSE_COLUMNS)
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (orderReadError) {
        Sentry.captureException(new Error(`Order read failed for closed dispute ${dispute.id} (${paymentIntentId}): ${orderReadError.message}`));
        return retryLater('Order read failed');
      }
      if (!firstRead) return retryLater(`No order for disputed payment ${paymentIntentId} yet`, 409);
      let order = firstRead;

      const closeInput = { id: dispute.id, status: dispute.status, amount: dispute.amount };
      let outcome = selectDisputeCloseOutcome(order, closeInput);
      if (outcome.kind === 'needs_assessment') {
        // Lost, and protection was never assessed: this `closed` arrived
        // before (or concurrently with) the `created` that would have done
        // it — Stripe closes an unanswered inquiry that escalates in the same
        // instant it escalates, and does not order deliveries. Assess now
        // against the same frozen evidence, persist it only if nobody else
        // has (the created handler may be running beside us), re-read, and
        // decide on what the row says then.
        const assessment = await assessProtection(supabase, order.id);
        if (!assessment) return retryLater('Protection evidence read failed');
        const { error: assessError } = await supabase
          .from('orders')
          .update({ protection_status: assessment.status })
          .eq('id', order.id)
          .eq('protection_status', 'pending');
        if (assessError) {
          Sentry.captureException(new Error(`Late protection assessment persist failed on order ${order.id}: ${assessError.message}`));
          return retryLater('Protection assessment persist failed');
        }
        const { data: reread, error: rereadError } = await supabase
          .from('orders')
          .select(CLOSE_COLUMNS)
          .eq('id', order.id)
          .maybeSingle();
        if (rereadError || !reread) {
          Sentry.captureException(new Error(`Order re-read failed after late assessment on ${order.id}: ${rereadError?.message ?? 'no row'}`));
          return retryLater('Order re-read failed');
        }
        order = reread;
        Sentry.captureMessage(
          `Dispute ${dispute.id} closed as lost before its open event was processed on order ${order.id}; protection assessed late as ${order.protection_status}.`,
          'warning'
        );
        outcome = selectDisputeCloseOutcome(order, closeInput);
        if (outcome.kind === 'needs_assessment') return retryLater('Protection still unassessed');
      }
      if (outcome.kind === 'noop') break; // redelivery of THIS processed loss

      // What this id means now (00057). A second dispute on the same payment
      // carries a new id and overwrites the first's — the row holds one.
      const closeRecord = { dispute_id: dispute.id, dispute_status: dispute.status };

      const title = (order.listing as unknown as { title: string } | null)?.title ?? 'an order';
      let artistTitle: string;
      let artistBody: string;

      if (outcome.kind === 'lost') {
        // THE BARGAIN. A Protected order means the artist did the things that
        // would have won this dispute, so Custom Canvas absorbs the loss and
        // the payout is NOT reversed. An ineligible order is reversed for the
        // DISPUTED amount (a partial chargeback claws back less than the
        // payout), idempotency-keyed on the dispute so a Stripe retry can't
        // double it, and skipped entirely when a settled refund already
        // reversed the payout.
        let reversedCents = 0;
        let transferAlreadyReversed = false;
        // Anything to reverse? Absorbed and zero-payout orders never touch
        // Stripe. Otherwise ask the transfer how much is already reversed
        // and decide again on that figure: a dashboard refund with "reverse
        // transfer" ticked leaves no stripe_reversal_id on the row, and a
        // second dispute after a partial first loss (04-r3 P2) may claw back
        // only what is left — the row's reversal id alone says neither.
        if (!outcome.platformAbsorbs && order.artist_payout_cents > 0) {
          try {
            const charge = await getStripe().charges.retrieve(dispute.charge as string);
            const transferId = charge.transfer
              ? (typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id)
              : null;
            if (transferId) {
              const transfer = await getStripe().transfers.retrieve(transferId);
              const amountReversed = transfer.amount_reversed ?? 0;
              transferAlreadyReversed = amountReversed >= transfer.amount;
              const decided = selectDisputeCloseOutcome(order, { ...closeInput, transferAmountReversed: amountReversed });
              if (decided.kind !== 'lost') return retryLater('Dispute outcome changed under re-selection');
              outcome = decided;
            }
            if (transferId && !transferAlreadyReversed && outcome.reverseCents > 0) {
              const reversal = await getStripe().transfers.createReversal(
                transferId,
                { amount: outcome.reverseCents },
                { idempotencyKey: `dispute_${dispute.id}` }
              );
              reversedCents = outcome.reverseCents;
              const { error: reversalError } = await supabase
                .from('orders')
                .update({ stripe_reversal_id: reversal.id })
                .eq('id', order.id);
              if (reversalError) {
                // The reversal exists at Stripe; a retry finds it by the
                // idempotency key. Do not ack over a lost id.
                Sentry.captureException(new Error(`Reversal ${reversal.id} persist failed on order ${order.id}: ${reversalError.message}`));
                return retryLater('Reversal persist failed');
              }
            }
          } catch (err) {
            Sentry.captureException(err);
            // Non-2xx so Stripe retries: the payout must not stay un-clawed.
            return retryLater('Dispute reversal failed');
          }
        }

        const { error: lostError } = await supabase
          .from('orders')
          .update({ status: 'refunded', dispute_outcome: 'lost', ...closeRecord })
          .eq('id', order.id);
        if (lostError) {
          Sentry.captureException(new Error(`Dispute-lost update failed on order ${order.id}: ${lostError.message}`));
          return retryLater('Dispute-lost update failed');
        }

        Sentry.captureMessage(
          outcome.platformAbsorbs
            ? `Dispute LOST on PROTECTED order ${order.id} — platform absorbs ${dispute.amount}c, payout NOT reversed.`
            : reversedCents > 0
            ? `Dispute LOST on ineligible order ${order.id} — ${reversedCents}c of the ${order.artist_payout_cents}c payout reversed${outcome.reversalAlreadyExists ? ' (on top of an earlier reversal)' : ''}.`
            : transferAlreadyReversed
            ? `Dispute LOST on order ${order.id} — the transfer was already fully reversed at Stripe (settled refund, dashboard refund or an earlier dispute); nothing reversed now.`
            : outcome.reversalAlreadyExists
            ? `Dispute LOST on order ${order.id} — payout was already reversed (${order.stripe_reversal_id ?? 'per Stripe'}); nothing reversed now.`
            : `Dispute LOST on order ${order.id} — no payout to reverse.`,
          'error'
        );

        if (outcome.platformAbsorbs) {
          artistTitle = 'Dispute lost — you are covered';
          artistBody = `The bank sided with the buyer on "${title}". This order was Protected, so Custom Canvas absorbed the loss and your payout is not affected.`;
        } else if (reversedCents > 0) {
          artistTitle = 'Dispute lost';
          artistBody = `The bank sided with the buyer on "${title}". ${formatPrice(reversedCents)} was deducted from your payout, as this order was not Protected.`;
        } else {
          artistTitle = 'Dispute lost';
          artistBody = `The bank sided with the buyer on "${title}". Your payout for this order had already been returned, so nothing further was deducted.`;
        }
      } else if (order.status !== 'disputed') {
        // Nothing is frozen. Either a closed inquiry that never escalated
        // (an inquiry never touches status — tell the artist and stop) or a
        // redelivery of a `won` after the restore already ran (say nothing
        // twice). Never rebuild a status here: the row moved for a reason.
        if (outcome.outcome === 'won') {
          Sentry.captureMessage(`Dispute ${dispute.id} won; order ${order.id} is already '${order.status}' — nothing to restore.`, 'info');
          break;
        }
        // Record the close against the id we hold; a different id on the
        // row (a later dispute) is left alone — zero rows is fine here.
        const { error: inquiryCloseError } = await supabase
          .from('orders')
          .update({ dispute_status: dispute.status })
          .eq('id', order.id)
          .eq('dispute_id', dispute.id);
        if (inquiryCloseError) {
          Sentry.captureException(new Error(`Inquiry close ${dispute.id} record failed on order ${order.id}: ${inquiryCloseError.message}`));
          return retryLater('Inquiry close record failed');
        }
        artistTitle = 'Bank inquiry closed';
        artistBody = `The bank closed its inquiry about "${title}" without a chargeback. Nothing changes on this order.`;
      } else {
        // Money stays. Put the order back where it was. Compare-and-swap on
        // `disputed`: a refund settled between the ruling and this delivery
        // (the first attempt failed and Stripe retried) has already moved the
        // row, and rewriting it as paid handed the buyer their money twice.
        // Zero rows = already handled; ack without re-notifying. dispute_id
        // stays on the row so a late open event for this dispute is
        // recognised as already recorded.
        const { data: restored, error: restoreError } = await supabase
          .from('orders')
          .update({
            status: outcome.status,
            dispute_outcome: outcome.outcome,
            pre_dispute_status: null,
            ...closeRecord,
          })
          .eq('id', order.id)
          .eq('status', 'disputed')
          .select('id')
          .maybeSingle();
        if (restoreError) {
          Sentry.captureException(new Error(`Dispute restore to ${outcome.status} failed on order ${order.id}: ${restoreError.message}`));
          return retryLater('Dispute restore failed');
        }
        if (!restored) {
          Sentry.captureMessage(`Dispute ${dispute.id} closed as ${dispute.status}; order ${order.id} was no longer disputed — already handled.`, 'info');
          break;
        }
        Sentry.captureMessage(`Dispute ${dispute.id} closed as ${dispute.status}; order ${order.id} restored to ${outcome.status}.`, 'info');

        if (outcome.outcome === 'won') {
          artistTitle = 'Dispute won';
          artistBody = `The bank ruled in your favor on "${title}". Your payout is unaffected and the order is back to ${outcome.status}.`;
        } else {
          artistTitle = 'Bank inquiry closed';
          artistBody = `The bank closed its inquiry about "${title}" without a chargeback. Nothing changes on this order.`;
        }
      }

      const { data: artistProf } = await supabase
        .from('artist_profiles').select('profile_id').eq('id', order.artist_id).maybeSingle();
      const rows: Array<Record<string, string>> = [];
      if (artistProf?.profile_id) {
        rows.push({ user_id: artistProf.profile_id, type: 'order_disputed', title: artistTitle, body: artistBody, link: '/studio/sales' });
      }
      for (const adminId of await adminIds(supabase)) {
        rows.push({
          user_id: adminId,
          type: 'order_disputed',
          title: `Dispute ${dispute.status}`,
          body: `The dispute on order ${order.id.slice(0, 8)} closed as ${dispute.status}.`,
          link: '/admin/orders',
        });
      }
      if (rows.length) await supabase.from('notifications').insert(rows);
      break;
    }

    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated': {
      // Bookkeeping only (SELLER_PROTECTION_SPEC): log so the Stripe balance
      // stays reconcilable against our order records. No state change here —
      // dispute.created/closed own the order lifecycle.
      const d = event.data.object;
      Sentry.captureMessage(
        `${event.type}: dispute ${d.id} on charge ${String(d.charge)} — ${d.amount}c`,
        'info'
      );
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
      // Stripe does not order deliveries: a stale payouts_enabled=false that
      // arrives after a newer true flipped a ready artist off until their
      // next account change (01-r2 appendix). Write only when this event is
      // newer than the last one recorded — the compare is in the WHERE, so
      // two deliveries racing cannot both win. Zero rows = stale or unknown
      // account; both are acks.
      const eventAt = new Date(event.created * 1000).toISOString();
      const { data: artistRow, error: accountError } = await supabase
        .from('artist_profiles')
        .update({ stripe_onboarded: ready, stripe_account_updated_at: eventAt })
        .eq('stripe_account_id', account.id)
        .or(`stripe_account_updated_at.is.null,stripe_account_updated_at.lt."${eventAt}"`)
        .select('id')
        .maybeSingle();
      if (accountError) {
        Sentry.captureException(new Error(`account.updated write failed for ${account.id}: ${accountError.message}`));
        return retryLater('account.updated write failed');
      }
      if (artistRow) {
        // Onboarding affects the completeness score — refresh canonically.
        await supabase.rpc('refresh_completeness_score', { p_artist_id: artistRow.id });
      } else {
        Sentry.captureMessage(
          `account.updated ${event.id} for ${account.id} (created ${eventAt}) skipped: no artist row, or a newer event is already recorded`,
          'info'
        );
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
