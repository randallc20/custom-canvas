import * as Sentry from '@sentry/nextjs';
import Stripe from 'stripe';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { getStripe } from '@/lib/stripe';
import { calculateRefundSplit, isFaultRefund, type RefundReason } from '@/utils/refundSplit';
import { returnBlocksSettlement, returnRequiredByDefault, type ReturnRecord } from '@/utils/orderReturns';
import { buyerTookPossession, pickupPossessionUnknown, pieceIsWithArtist } from '@/utils/fulfillment';

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * The one place money goes back to a buyer.
 *
 * Extracted from the admin settle route (L7) because it acquired two more
 * callers: the buyer cancelling an order the artist never shipped, and the
 * fulfilment-window cron cancelling one the artist went silent on. Three
 * copies of Stripe idempotency keys, the exact-payout reversal and the
 * relist rule is not a thing to have.
 *
 * Policy (DECISIONS.md 2026-07-06, tax 2026-08-18, reason split 2026-09-03):
 * the buyer gets the artwork price + shipping + the tax on those lines back,
 * and on a FAULT reason the service fee and its tax as well; the artist
 * returns their full payout (85% + shipping); the platform returns its
 * commission.
 *
 * Crash safety, unchanged from the original: each Stripe mutation carries an
 * idempotency key and its resulting object id is persisted immediately, so a
 * retry resumes from the failed step instead of re-attempting a completed
 * refund (which Stripe rejects, which used to wedge the order forever).
 */

export type SettleRefundOutcome =
  | {
      ok: true;
      refundedCents: number;
      taxRefundedCents: number;
      payoutReversedCents: number;
      /** True when this call did the work; false when it was already done. */
      relisted: boolean;
    }
  | { ok: false; status: number; error: string };

const RETRY_CLOSE = 'Refund done at Stripe but the order could not be closed — retry.';

/** Raised inside the Stripe block when what is already at Stripe does not match
 *  what this settle would do. It is not a failure to retry — it is a state a
 *  human made and only a human can resolve — so it escapes the retry-shaped
 *  catch and becomes a 409 with the numbers in it. */
class StripeStateMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeStateMismatch';
  }
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function settleRefund(
  admin: AdminClient,
  opts: {
    orderId: string;
    reason: RefundReason;
    initiatedBy: 'artist' | 'buyer' | 'platform';
    /** Free text carried into the Stripe refund's metadata. */
    note?: string;
    /**
     * Extra guard for callers that must only act on an unshipped order — the
     * buyer's cancel right and the cron both apply only before shipment
     * (Terms of Sale §3, Artist Agreement §7). Checked inside the same read
     * the money decision is made from, so it cannot be raced past.
     */
    requireUnshipped?: boolean;
  },
): Promise<SettleRefundOutcome> {
  const { data: order } = await admin
    .from('orders')
    .select(
      'id, status, stripe_payment_intent_id, amount_cents, shipping_cents, buyer_fee_cents, amount_tax_cents, artist_payout_cents, listing_id, stripe_refund_id, stripe_reversal_id, refund_approved_at, refund_reason, shipped_at, is_pickup, delivered_at, pickup_confirmed_by_buyer_at, pickup_confirmed_by_artist_at',
    )
    .eq('id', opts.orderId)
    .single();
  if (!order) return { ok: false, status: 404, error: 'Not found' };
  if (order.status === 'refunded') return { ok: false, status: 400, error: 'Already refunded' };
  // Stripe refuses refunds while a chargeback is open, and a refund settled
  // between the ruling and the closed event's delivery is exactly what the
  // dispute restore must not overwrite. Wait for the dispute to close.
  if (order.status === 'disputed') {
    return {
      ok: false,
      status: 409,
      error:
        'This order is under an open chargeback. Stripe will not refund it until the dispute closes; settle it then.',
    };
  }
  // Everything from here to the Stripe calls decides WHETHER money should
  // move. Once it has, those questions are settled and re-asking them is how a
  // half-finished settle gets stuck: the refund is at Stripe, the close failed,
  // and the retry is turned away by a gate that has since changed its mind —
  // leaving the buyer refunded, the order still `paid`, and the artist free to
  // ship (r5 money pass, P2). After the money moves, the only work left is
  // bookkeeping, and bookkeeping must always be completable.
  const moneyHasMoved = !!order.stripe_refund_id;
  if (moneyHasMoved) {
    Sentry.captureMessage(
      `settleRefund resuming order ${order.id}: refund ${order.stripe_refund_id} already exists, gates skipped.`,
      'info',
    );
  }

  if (opts.requireUnshipped && !moneyHasMoved) {
    // A LOCAL PICKUP order has no shipping promise to miss and never gets a
    // shipped_at, so it passed this check by construction — which let the
    // nightly cron refund a collected pickup piece in full and relist it
    // while it hung on the buyer's wall (r6 money pass, P0). The whole
    // missed-window path is about a shipment; pickup no-shows are a support
    // process (Shipping, "Local pickup"), and SalesSection says so in words.
    if (order.is_pickup) {
      return {
        ok: false,
        status: 409,
        error:
          'This is a local-pickup order, so there is no shipping window to miss. A buyer who has not collected is a support matter — write to support@customcanvas.shop.',
      };
    }
    if (order.shipped_at || order.status !== 'paid') {
      return {
        ok: false,
        status: 409,
        error: 'This order has already shipped — talk to the artist about a return instead.',
      };
    }
  }
  if (!order.stripe_payment_intent_id) {
    return { ok: false, status: 409, error: 'This order has no payment to refund.' };
  }

  // "Approving a refund is your decision, not ours — with four exceptions"
  // (Artist Agreement §8). A fault reason IS that exception and needs no
  // artist approval; a discretionary change-of-mind refund does.
  if (!moneyHasMoved && !isFaultRefund(opts.reason) && !order.refund_approved_at) {
    return {
      ok: false,
      status: 409,
      error:
        "A change-of-mind refund needs the artist to approve it first. If the fault is ours or the artist's — never shipped, lost, damaged, not as described, our error — choose that reason instead and this settles without them.",
    };
  }

  // L8: "the refund may be issued after delivery and reasonable inspection of
  // the returned artwork". When a return is required and has neither been
  // accepted on inspection nor waived, the money does not move — otherwise
  // the buyer keeps the piece AND the money, the one outcome the documents
  // are explicit about preventing.
  //
  // Checked HERE rather than in the admin route so it cannot be walked
  // around: the cron and the buyer's cancel path go through this function
  // too, and a gate that only guards one door is not a gate.
  //
  // Not re-asked on a resume: see `moneyHasMoved` above. The gate's whole
  // purpose is to hold the money back, and by then it is gone.
  if (!moneyHasMoved) {
    const { data: ret, error: retError } = await admin
      .from('order_returns')
      .select('*')
      .eq('order_id', order.id)
      .maybeSingle();
    // Fail CLOSED. Discarding this error opened the one gate that stops the
    // buyer keeping the piece AND the money, on a transient read failure
    // (r8 money pass, P2).
    if (retError) {
      Sentry.captureException(retError, { extra: { where: 'settleRefund.returnGate', orderId: order.id } });
      return {
        ok: false,
        status: 503,
        error: 'Could not check whether a return is required on this order. Nothing was refunded — try again.',
      };
    }
    const blocked = returnBlocksSettlement(
      (ret as ReturnRecord | null) ?? null,
      // No record yet: is one owed? The reason's default, judged against who
      // actually has the piece.
      returnRequiredByDefault(opts.reason, buyerTookPossession(order) || pickupPossessionUnknown(order)),
    );
    if (blocked) return { ok: false, status: 409, error: blocked };
  }

  // The reason is not decoration: it IS the split, and it is the sentence the
  // buyer reads on their Orders page. Once the money is at Stripe the amount
  // cannot be recomputed, so a settle under a different reason would leave the
  // row promising one thing and the bank statement showing another.
  if (moneyHasMoved && order.refund_reason && order.refund_reason !== opts.reason) {
    return {
      ok: false,
      status: 409,
      error: `This order was already refunded at Stripe under "${order.refund_reason}", and that decided the amount. It cannot be re-settled as "${opts.reason}". If the reason was wrong, write to support@customcanvas.shop rather than settling again.`,
    };
  }

  const stripe = getStripe();
  const { refundTax, refundAmount, refundFee } = calculateRefundSplit(order, opts.reason);

  // Record the decision BEFORE moving money, so a crash between Stripe and
  // the close leaves a row that says what was being done and at what split.
  // The columns are frozen for everyone but the service role (00061).
  //
  // Written UNCONDITIONALLY. It used to carry `.is('refund_reason', null)`,
  // which meant the approval's `change_of_mind` stamp survived a settle made
  // under any other reason: the money followed `opts.reason` and the row —
  // and so the buyer's Orders page and the admin table — kept saying
  // "change of mind — service fee retained" over a refund that returned the
  // fee (r5 money pass, P2; r9 money pass). Switching the reason at the
  // settle door is a supported thing to do; the row has to follow it.
  const { error: reasonError } = await admin
    .from('orders')
    .update({ refund_reason: opts.reason, refund_initiated_by: opts.initiatedBy })
    .eq('id', order.id);
  if (reasonError && !moneyHasMoved) {
    // Fail closed: proceeding would move money the row does not describe,
    // which is the exact disagreement this write exists to prevent.
    Sentry.captureException(reasonError, { extra: { where: 'settleRefund.reason', orderId: order.id } });
    return {
      ok: false,
      status: 502,
      error: 'Could not record the refund decision, so nothing was refunded — try again.',
    };
  }
  if (reasonError) {
    Sentry.captureException(reasonError, { extra: { where: 'settleRefund.reason.resume', orderId: order.id } });
  }

  let refundId = order.stripe_refund_id as string | null;
  let reversalId = order.stripe_reversal_id as string | null;
  // Measured, not inferred. Deriving this from "is there a reversal id" is how
  // a partial reversal got reported as the whole payout (r11 money pass, P1).
  let payoutReversedCents = 0;

  try {
    // Step 1 — buyer refund (skipped on retry if already created).
    //
    // Look before creating. The idempotency key is `refund_<order id>` and it
    // has to stay that way — one order gets one refund, and keying it on the
    // reason or the note would turn a re-settle into a SECOND refund. But a
    // stable key with an unstable body is its own trap: Stripe rejects a reuse
    // whose parameters differ, and the reason, the amount and the note all
    // differ between the three doors that call this (r5 money pass, P2). That
    // rejection surfaced as "Refund failed at Stripe — safe to retry", which
    // it was not: retrying re-sent the same mismatched body forever.
    //
    // Adopt ONLY a refund that is exactly the one this settle would have
    // created: our metadata, and our amount. Anything else — a hand-issued
    // goodwill partial in the Dashboard, or our own refund from an earlier
    // settle under a DIFFERENT reason — is refused, loudly, with the numbers.
    //
    // Adopting `data[0]` unconditionally, which is what this did for about an
    // hour, was a P0 (r11 money pass): a $25 goodwill refund on a $521 order
    // got adopted, the create was skipped, the artist's whole payout was
    // reversed, the listing was relisted and the admin was told the buyer had
    // been refunded $521. Nothing downstream catches it — `charge.refunded`
    // returns early on a partial, and the reconcile cron treats "any refund at
    // all" as refunded. Creating a second refund would be worse; refusing is
    // the only answer that neither loses money nor invents it.
    if (!refundId) {
      const existing = await stripe.refunds.list({
        payment_intent: order.stripe_payment_intent_id,
        limit: 100,
      });
      // A failed or cancelled refund moved no money and is not in the way.
      const live = existing.data.filter(
        (r) => r.status !== 'failed' && r.status !== 'canceled',
      );
      if (live.length > 0) {
        const ours =
          live.length === 1 &&
          live[0].metadata?.order_id === order.id &&
          live[0].amount === refundAmount
            ? live[0]
            : null;
        if (!ours) {
          const total = live.reduce((sum, r) => sum + r.amount, 0);
          throw new StripeStateMismatch(
            `Stripe already holds ${live.length} refund${live.length === 1 ? '' : 's'} on this payment totalling ${dollars(total)}, which is not the ${dollars(refundAmount)} this settle would return. Nothing was changed. Settle the difference in the Stripe Dashboard, or pick the reason that matches what was already refunded.`,
          );
        }
        refundId = ours.id;
        await admin.from('orders').update({ stripe_refund_id: refundId }).eq('id', order.id);
        Sentry.captureMessage(
          `settleRefund resumed: adopted its own Stripe refund ${ours.id} (${dollars(ours.amount)}) for order ${order.id}`,
          'info',
        );
      }
    }

    if (!refundId) {
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripe_payment_intent_id,
          amount: refundAmount,
          reverse_transfer: false,
          metadata: {
            policy_refund: 'true',
            order_id: order.id,
            refund_reason: opts.reason,
            refund_initiated_by: opts.initiatedBy,
            fee_refunded: String(refundFee > 0),
            // Stripe caps a metadata value at 500 characters and rejects the
            // whole refund over it — which the catch below then reported as
            // "safe to retry", into the same rejection (01-r2 appendix).
            ...(opts.note ? { admin_reason: opts.note.slice(0, 500) } : {}),
          },
        },
        { idempotencyKey: `refund_${order.id}` },
      );
      refundId = refund.id;
      await admin.from('orders').update({ stripe_refund_id: refundId }).eq('id', order.id);
    }

    // Step 2 — exact artist payout reversal (skipped on retry if done).
    if (order.artist_payout_cents > 0 && payoutReversedCents < order.artist_payout_cents) {
      const pi = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge as Stripe.Charge | null;
      if (charge?.transfer) {
        const transferId = typeof charge.transfer === 'string' ? charge.transfer : charge.transfer.id;
        // Work from the transfer's OWN `amount_reversed`, the way the
        // dispute-close handler in the Stripe webhook already does. Taking
        // `listReversals().data[0]` and calling the payout fully reversed was
        // a P1 (r11 money pass): a dashboard refund with "reverse transfer"
        // ticked, or a partial claw-back, left a smaller reversal that this
        // adopted — the artist kept the difference and the platform funded it,
        // while the admin was told the whole payout had come back.
        //
        // Reversing only the SHORTFALL makes a second run a no-op rather than
        // a double claw-back, and the key carries the amount so two runs that
        // compute the same shortfall collapse into one reversal while a
        // genuinely different one is not silently swallowed.
        const transfer = await stripe.transfers.retrieve(transferId);
        const already = transfer.amount_reversed ?? 0;
        const owed = order.artist_payout_cents - already;
        if (owed > 0) {
          const reversal = await stripe.transfers.createReversal(
            transferId,
            { amount: owed },
            { idempotencyKey: `reversal_${order.id}_${owed}` },
          );
          reversalId = reversal.id;
          await admin.from('orders').update({ stripe_reversal_id: reversalId }).eq('id', order.id);
        } else if (already > 0) {
          Sentry.captureMessage(
            `settleRefund: transfer ${transferId} for order ${order.id} was already reversed by ${dollars(already)}; nothing further owed.`,
            'info',
          );
        }
        // What actually came back, never more than the payout.
        payoutReversedCents = Math.min(order.artist_payout_cents, already + Math.max(0, owed));
      }
    }
  } catch (err) {
    if (err instanceof StripeStateMismatch) {
      // Not a fault and not retryable: Stripe's state and this settle's
      // intention disagree, and a person has to decide which is right.
      Sentry.captureMessage(`settleRefund refused on order ${order.id}: ${err.message}`, 'warning');
      return { ok: false, status: 409, error: err.message };
    }
    Sentry.captureException(err);
    // State so far is persisted — a retry resumes from the failed step.
    return {
      ok: false,
      status: 502,
      error: refundId
        ? 'Buyer refunded, but the artist payout reversal failed — RETRY to complete it.'
        : 'Refund failed at Stripe — safe to retry.',
    };
  }

  // Step 3 — close the order. CAS so concurrent settles resolve cleanly (the
  // Stripe idempotency keys already made their money ops no-ops). The write
  // is asserted: the money has moved at Stripe, so a close that silently
  // fails leaves a `paid` order the artist can still ship.
  // Relist ONLY when we are confident the artist still has it. Using
  // buyerTookPossession alone left the third state — a pickup order neither
  // party confirmed — reading as "the artist has it", while the return gate
  // read the same state as "the buyer might", so the piece went back on sale
  // AND a return was demanded for it (r7 auth pass, P0).
  const wasShipped = !pieceIsWithArtist(order);
  const { data: closed, error: closeError } = await admin
    .from('orders')
    .update({ status: 'refunded' })
    .neq('status', 'refunded')
    .eq('id', order.id)
    .select('id')
    .maybeSingle();
  if (closeError || !closed) {
    Sentry.captureException(
      new Error(`Refund close failed on order ${order.id}: ${closeError?.message ?? 'zero rows'}`),
    );
    return { ok: false, status: 502, error: RETRY_CLOSE };
  }

  // Relist ONLY a never-shipped piece — a shipped/delivered artwork is
  // physically with the buyer; the artist relists manually after return — and
  // only from `sold`: a listing the artist has since hidden stays hidden. No
  // OTHER order may hold the slot: the set matches
  // orders_one_live_per_listing (00055) — a disputed order holds it too.
  let relisted = false;
  if (order.listing_id && !wasShipped) {
    const { count, error: countError } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', order.listing_id)
      .in('status', ['paid', 'shipped', 'delivered', 'disputed'])
      .neq('id', order.id);
    if (countError) {
      Sentry.captureException(
        new Error(`Relist check failed for listing ${order.listing_id}: ${countError.message}`),
      );
      return { ok: false, status: 502, error: RETRY_CLOSE };
    }
    if ((count ?? 0) === 0) {
      const { data: row, error: relistError } = await admin
        .from('listings')
        .update({ status: 'available', sold_price_cents: null })
        .eq('id', order.listing_id)
        .eq('status', 'sold')
        .select('id')
        .maybeSingle();
      if (relistError) {
        Sentry.captureException(
          new Error(`Relist of ${order.listing_id} failed after refund: ${relistError.message}`),
        );
        return { ok: false, status: 502, error: RETRY_CLOSE };
      }
      // Zero rows is legitimate here: the listing is not `sold` any more (the
      // artist hid it, or a retry already relisted it) — that is the "stays
      // hidden" rule above, not a refused write.
      if (row) relisted = true;
      else {
        Sentry.captureMessage(
          `Refund on order ${order.id}: listing ${order.listing_id} not relisted (no longer 'sold').`,
          'info',
        );
      }
    }
  }

  return {
    ok: true,
    refundedCents: refundAmount,
    taxRefundedCents: refundTax,
    payoutReversedCents,
    relisted,
  };
}
