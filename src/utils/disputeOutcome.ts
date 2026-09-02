// Branch selection for the Stripe dispute webhooks, factored out of
// src/app/api/webhooks/stripe/route.ts so the money tests can pin every case
// (04-P1 x2, 04-P2 "won dispute regresses shipped", 04 appendix, 05-P3 tests).
// Pure: no I/O, no clock. The route does the reads, calls these, then does
// the writes and Stripe calls the result names.

/** Stripe fires charge.dispute.created for card-network INQUIRIES too
 *  (retrievals, Visa pre-dispute inquiries). They arrive with a `warning_*`
 *  status, withdraw no funds, and close as `warning_closed`. */
export function isInquiryDispute(status: string): boolean {
  return status.startsWith('warning_');
}

export interface DisputeOpenOrder {
  status: string;
  stripe_refund_id: string | null;
  dispute_id: string | null;
}

export interface DisputeRef {
  id: string;
  status: string;
}

export type DisputeOpenAction =
  /** Redelivery, or an inquiry we already recorded. Nothing to do. */
  | 'already_recorded'
  /** Inquiry: record the id and notify, never change status or assess. */
  | 'inquiry'
  /** A chargeback on a payment already refunded (admin settle or dashboard).
   *  The money already went back; record the id, tell admins, leave the
   *  refunded status alone so it can't be flipped back to paid later. */
  | 'post_refund'
  /** A real chargeback on a live order: freeze it as disputed. */
  | 'chargeback';

export function selectDisputeOpenAction(order: DisputeOpenOrder, dispute: DisputeRef): DisputeOpenAction {
  if (isInquiryDispute(dispute.status)) {
    return order.dispute_id === dispute.id ? 'already_recorded' : 'inquiry';
  }
  if (order.status === 'disputed') return 'already_recorded';
  if (order.stripe_refund_id || order.status === 'refunded') {
    return order.dispute_id === dispute.id ? 'already_recorded' : 'post_refund';
  }
  return 'chargeback';
}

export interface DisputeCloseOrder {
  status: string;
  pre_dispute_status: string | null;
  stripe_refund_id: string | null;
  stripe_reversal_id: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  artist_payout_cents: number;
  protection_status: string;
  dispute_outcome: string | null;
}

export interface DisputeCloseInput {
  status: string;
  /** Disputed amount in cents — a partial chargeback disputes less than the charge. */
  amount: number;
}

export type RestoredStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded';

export type DisputeCloseOutcome =
  /** Already processed as lost (Stripe redelivery). */
  | { kind: 'noop' }
  | {
      kind: 'lost';
      status: 'refunded';
      /** Cents to reverse on the artist transfer; 0 when nothing is owed. */
      reverseCents: number;
      /** A Protected order: Custom Canvas absorbs the loss, payout untouched. */
      platformAbsorbs: boolean;
      /** The payout was already reversed (a settled refund) — do not log
       *  "payout reversed" for something that did not happen here. */
      reversalAlreadyExists: boolean;
    }
  | {
      kind: 'restored';
      status: RestoredStatus;
      /** `won` for a won chargeback; null for a closed inquiry, which was
       *  never a dispute the artist won or lost. */
      outcome: 'won' | null;
    };

/** The amount clawed back on a lost dispute: the disputed amount, never
 *  more than the payout actually recorded. */
export function disputeReversalCents(disputeAmount: number, artistPayoutCents: number): number {
  return Math.max(0, Math.min(disputeAmount, artistPayoutCents));
}

/** Where a non-lost dispute puts the order back. Priority: the status saved
 *  when the dispute froze it; else refunded when the money already went
 *  back; else shipped for a piece still in transit; else the old rule. */
export function restoredStatus(order: DisputeCloseOrder): RestoredStatus {
  if (order.pre_dispute_status) return order.pre_dispute_status as RestoredStatus;
  if (order.stripe_refund_id || order.status === 'refunded') return 'refunded';
  if (order.shipped_at && !order.delivered_at) return 'shipped';
  return order.delivered_at ? 'delivered' : 'paid';
}

export function selectDisputeCloseOutcome(order: DisputeCloseOrder, dispute: DisputeCloseInput): DisputeCloseOutcome {
  if (dispute.status === 'lost') {
    if (order.dispute_outcome === 'lost') return { kind: 'noop' };
    const platformAbsorbs = order.protection_status === 'protected';
    const reversalAlreadyExists = !!order.stripe_reversal_id;
    const reverseCents =
      platformAbsorbs || reversalAlreadyExists
        ? 0
        : disputeReversalCents(dispute.amount, order.artist_payout_cents);
    return { kind: 'lost', status: 'refunded', reverseCents, platformAbsorbs, reversalAlreadyExists };
  }
  // "Not lost" is the restore branch: `won` and `warning_closed` both land
  // here. The old `else if (status === 'won')` left closed inquiries stuck
  // at disputed forever.
  return {
    kind: 'restored',
    status: restoredStatus(order),
    outcome: dispute.status === 'won' ? 'won' : null,
  };
}
