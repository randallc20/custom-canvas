// Pure comparison for the daily Stripe reconcile cron (R4 / 04-P2). Given a
// succeeded payment intent, its latest charge (with the dispute attached when
// one exists) and the `orders` row keyed by that payment intent, describe every
// way Stripe's view and ours disagree. No I/O here; the route owns that.
//
// What counts as a row: a normal order OR the oversell audit row — the
// webhook records an oversold payment as an `orders` row with
// status 'refunded' under the same payment intent, so both arrive here as
// `order` and the audit case is simply "refunded on both sides".

export interface ReconcilePaymentIntent {
  id: string;
  amount: number;
}

// Structural subset of Stripe.Charge so tests need no SDK objects. A real
// Stripe.Charge satisfies it; the current API version exposes only the
// `disputed` flag on a charge, so the route looks the dispute up separately
// and attaches it here (an id alone means "known to exist, status unknown").
export interface ReconcileCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  refunded: boolean;
  disputed: boolean;
  dispute?: string | { id: string; status: string } | null;
}

export interface ReconcileOrder {
  id: string;
  status: string;
  stripe_refund_id: string | null;
  stripe_reversal_id: string | null;
  dispute_id: string | null;
  /** What the webhook recorded dispute_id as (00057); null before it. */
  dispute_status: string | null;
  dispute_outcome: 'won' | 'lost' | 'accepted' | null;
}

export type MismatchKind =
  | 'no_order'
  | 'stripe_refunded_order_not_refunded'
  | 'order_refunded_stripe_not_refunded'
  | 'stripe_disputed_order_not_disputed'
  /** An open chargeback on a refunded payment that the row only knows as an
   *  inquiry (or not at all): the escalation the admin must answer before
   *  the bank's deadline, and the one the webhook used to drop (04-r3 P1). */
  | 'dispute_escalated_on_refunded_order'
  | 'dispute_lost_order_not_refunded'
  | 'dispute_closed_order_still_disputed';

export interface Mismatch {
  kind: MismatchKind;
  paymentIntentId: string;
  orderId: string | null;
  detail: string;
}

// Dispute statuses that are still open and hold funds. `warning_*` are card
// network inquiries: no funds move and (after R2) the webhook leaves the
// order's status alone, so an inquiry never constrains the row either way.
const OPEN_DISPUTE = new Set(['needs_response', 'under_review']);
const CLOSED_NOT_LOST = new Set(['won', 'warning_closed', 'charge_refunded']);

export function diffPaymentAgainstOrder(
  pi: ReconcilePaymentIntent,
  charge: ReconcileCharge | null,
  order: ReconcileOrder | null
): Mismatch[] {
  const out: Mismatch[] = [];
  const push = (kind: MismatchKind, detail: string) =>
    out.push({ kind, paymentIntentId: pi.id, orderId: order?.id ?? null, detail });

  if (!order) {
    push('no_order', `${pi.amount}c succeeded with no orders row (charge ${charge?.id ?? 'none'})`);
    return out;
  }

  const dispute = charge?.dispute ?? null;
  const disputeStatus = dispute && typeof dispute === 'object' ? dispute.status : null;
  const disputed = !!charge?.disputed || dispute !== null;
  const isOpenInquiry =
    disputeStatus === 'warning_needs_response' || disputeStatus === 'warning_under_review';

  const stripeRefunded = !!charge && (charge.refunded || charge.amount_refunded > 0);
  const orderRefunded = order.status === 'refunded';
  const orderRecordsLoss = order.dispute_outcome === 'lost' || order.dispute_outcome === 'accepted';
  // A lost dispute returns the buyer's money through the dispute, not a
  // refund, and the webhook writes status 'refunded' + dispute_outcome 'lost'.
  const lostDispute =
    disputeStatus === 'lost' || (disputeStatus === null && disputed && orderRecordsLoss);

  // --- refund direction ---
  if (stripeRefunded && !orderRefunded) {
    push(
      'stripe_refunded_order_not_refunded',
      `charge ${charge!.id} refunded ${charge!.amount_refunded}/${charge!.amount}c but order is '${order.status}'`
    );
  }
  if (orderRefunded && !stripeRefunded && !lostDispute) {
    push(
      'order_refunded_stripe_not_refunded',
      `order is 'refunded' (refund_id ${order.stripe_refund_id ?? 'none'}) but charge ${charge?.id ?? 'none'} has no refund and no lost dispute`
    );
  }

  // --- dispute direction ---
  if (disputed && !isOpenInquiry) {
    if (disputeStatus === 'lost') {
      if (!orderRefunded) {
        push('dispute_lost_order_not_refunded', `dispute lost but order is '${order.status}'`);
      }
    } else if (disputeStatus !== null && CLOSED_NOT_LOST.has(disputeStatus)) {
      if (order.status === 'disputed') {
        push('dispute_closed_order_still_disputed', `dispute closed as '${disputeStatus}' but order is still 'disputed'`);
      }
    } else if (disputeStatus !== null && OPEN_DISPUTE.has(disputeStatus)) {
      // Open: the row must show it, unless the money already went back via a
      // refund (a chargeback on a refunded order leaves status alone) — and
      // even then the row must know it as a CHARGEBACK. An inquiry recorded
      // before the platform's own refund can still escalate (Stripe:
      // "inquiries on partially refunded charges can still escalate to a
      // chargeback"); if the webhook dropped that escalation, the recorded
      // status is still warning_* (or null) while Stripe's is open.
      if (order.status !== 'disputed' && !(orderRefunded && stripeRefunded)) {
        push('stripe_disputed_order_not_disputed', `dispute '${disputeStatus}' open but order is '${order.status}'`);
      } else if (
        orderRefunded && stripeRefunded &&
        (order.dispute_status === null || order.dispute_status.startsWith('warning_'))
      ) {
        push(
          'dispute_escalated_on_refunded_order',
          `dispute '${disputeStatus}' open on refunded order but the row records it as '${order.dispute_status ?? 'nothing'}' — respond in Stripe with the refund as evidence`
        );
      }
    } else {
      // Dispute not expanded (id only) or an unknown status: accept any row
      // that has recorded a dispute at some point.
      const recorded = order.status === 'disputed' || order.dispute_outcome !== null || order.dispute_id !== null;
      if (!recorded && !(orderRefunded && stripeRefunded)) {
        push('stripe_disputed_order_not_disputed', `charge disputed (status unknown) but order '${order.status}' records no dispute`);
      }
    }
  }

  return out;
}

// --- which payments to look at (R13 / 04-r2 P2 "reconcile window") ---
//
// Refunds and disputes land weeks to months after the payment, so a window on
// payment_intent.created never contained the events this cron exists to
// catch. The route now also lists refunds and disputes CREATED in the window
// and every `orders` row currently `disputed` (whatever its age), and diffs
// the union. Only the payment window carries the no-order check: an old
// payment with no row is not a new fact, and the sweep must not page for it
// every day.

export interface ReconcileTargets {
  /** Every payment intent to diff: the window first, then the extras, deduped. */
  all: string[];
  /** Extras not already in the window — the route must retrieve these. */
  retrieve: string[];
  /** The window's ids: only these get the no-order check. */
  windowIds: Set<string>;
}

export function reconcileTargets(
  windowIds: string[],
  extraIds: Array<string | null | undefined>
): ReconcileTargets {
  const window = new Set<string>();
  for (const id of windowIds) if (id) window.add(id);
  const all = Array.from(window);
  const retrieve: string[] = [];
  const seen = new Set(window);
  for (const id of extraIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    all.push(id);
    retrieve.push(id);
  }
  return { all, retrieve, windowIds: window };
}

/** The payment intent id off a Stripe refund or dispute, which may carry it
 *  as a string, an expanded object, or nothing (a refund on a bare charge). */
export function paymentIntentIdOf(obj: { payment_intent: string | { id: string } | null }): string | null {
  const pi = obj.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}
