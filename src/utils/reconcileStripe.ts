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
  dispute_outcome: 'won' | 'lost' | 'accepted' | null;
}

export type MismatchKind =
  | 'no_order'
  | 'stripe_refunded_order_not_refunded'
  | 'order_refunded_stripe_not_refunded'
  | 'stripe_disputed_order_not_disputed'
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
      // refund (a chargeback on a refunded order leaves status alone).
      if (order.status !== 'disputed' && !(orderRefunded && stripeRefunded)) {
        push('stripe_disputed_order_not_disputed', `dispute '${disputeStatus}' open but order is '${order.status}'`);
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
