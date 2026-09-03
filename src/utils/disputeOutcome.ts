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
  /** The last Stripe status the webhook recorded for dispute_id (00057):
   *  what "we have this id" MEANT — an inquiry, a chargeback after a
   *  refund, a frozen chargeback. Null on rows recorded before 00057. */
  dispute_status: string | null;
  /** Non-null once dispute_id is over: won, lost, accepted. */
  dispute_outcome: string | null;
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
   *  A refund exists on this payment; record the id and status, tell admins,
   *  leave the refunded status alone so it can't be flipped back to paid
   *  later. Also the answer when the same id comes back with a DIFFERENT
   *  open status than the one recorded — a duplicate admin ping is cheap
   *  next to a swallowed one. */
  | 'post_refund'
  /** The inquiry we recorded on this (since refunded) payment has escalated
   *  to a chargeback: same dispute id, recorded status `warning_*` (or null
   *  on a pre-00057 row), incoming status open and not an inquiry. Stripe:
   *  "inquiries on partially refunded charges can still escalate to a
   *  chargeback". Keying the redelivery check on the id alone dropped this
   *  as a duplicate, nobody was told, and the deadline passed. */
  | 'post_refund_escalated'
  /** A real chargeback on a live order: freeze it as disputed. */
  | 'chargeback';

/** Dispute statuses Stripe reports once the dispute is over. An open event
 *  (created/updated) carrying one of these is late or resent — a retry that
 *  409'd earlier, an operator's Resend, or an `updated` emitted alongside
 *  `closed` — and the closed handler owns whatever happened. Re-freezing on it
 *  would leave the order `disputed` with no closing event ever coming. */
const CLOSED_DISPUTE_STATUSES = new Set(['won', 'lost', 'warning_closed', 'charge_refunded']);

export function isClosedDisputeStatus(status: string): boolean {
  return CLOSED_DISPUTE_STATUSES.has(status);
}

export function selectDisputeOpenAction(order: DisputeOpenOrder, dispute: DisputeRef): DisputeOpenAction {
  if (isClosedDisputeStatus(dispute.status)) return 'already_recorded';
  // An open event's payload never changes (Stripe: "the contents of `data`
  // never change"), so a `created` resent after the dispute closed still
  // carries needs_response. The row knows the dispute is over — the closed
  // handler wrote its outcome — and that outranks the payload.
  if (order.dispute_id === dispute.id && order.dispute_outcome !== null) return 'already_recorded';
  if (isInquiryDispute(dispute.status)) {
    return order.dispute_id === dispute.id ? 'already_recorded' : 'inquiry';
  }
  if (order.status === 'disputed') return 'already_recorded';
  if (order.stripe_refund_id || order.status === 'refunded') {
    if (order.dispute_id !== dispute.id) return 'post_refund';
    // Same id, open non-inquiry status. What did we record it as?
    if (order.dispute_status === null || isInquiryDispute(order.dispute_status)) return 'post_refund_escalated';
    return order.dispute_status === dispute.status ? 'already_recorded' : 'post_refund';
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
  dispute_id: string | null;
  dispute_outcome: string | null;
}

export interface DisputeCloseInput {
  id: string;
  status: string;
  /** Disputed amount in cents — a partial chargeback disputes less than the charge. */
  amount: number;
  /** Cents already reversed on the artist transfer, as Stripe reports it
   *  (`transfer.amount_reversed`), when the route has retrieved the transfer.
   *  A second dispute on the same payment after a partial first loss may
   *  claw back only what is left of the payout; a settled refund already
   *  reversed all of it. Undefined = not retrieved yet: the route selects
   *  once to learn whether money could move, retrieves, and selects again. */
  transferAmountReversed?: number;
}

export type RestoredStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'refunded';

export type DisputeCloseOutcome =
  /** THIS dispute is already processed as lost (Stripe redelivery). A
   *  different dispute id on a lost row is a second dispute on the same
   *  payment, never a redelivery. */
  | { kind: 'noop' }
  /** Lost on an order whose protection was never assessed: `closed` arrived
   *  before (or concurrently with) the `created` that would have assessed it.
   *  Never a reversal decision — the route assesses, re-reads, re-selects. */
  | { kind: 'needs_assessment' }
  | {
      kind: 'lost';
      status: 'refunded';
      /** Cents to reverse on the artist transfer; 0 when nothing is owed. */
      reverseCents: number;
      /** A Protected order: Custom Canvas absorbs the loss, payout untouched. */
      platformAbsorbs: boolean;
      /** A reversal already exists on the payout (a settled refund, or an
       *  earlier lost dispute) — do not log "payout reversed" for something
       *  that did not happen here. */
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

/** Where a non-lost dispute puts the order back. Priority: refunded when the
 *  money already went back (a refund settled between the ruling and this
 *  event's delivery outranks the status saved at freeze time — the buyer has
 *  the money, whatever the order was before); else the status saved when the
 *  dispute froze it; else shipped for a piece still in transit; else the old
 *  rule. */
export function restoredStatus(order: DisputeCloseOrder): RestoredStatus {
  if (order.stripe_refund_id || order.status === 'refunded') return 'refunded';
  if (order.pre_dispute_status) return order.pre_dispute_status as RestoredStatus;
  if (order.shipped_at && !order.delivered_at) return 'shipped';
  return order.delivered_at ? 'delivered' : 'paid';
}

export function selectDisputeCloseOutcome(order: DisputeCloseOrder, dispute: DisputeCloseInput): DisputeCloseOutcome {
  if (dispute.status === 'lost') {
    // Keyed on the id, not the outcome column alone: Stripe can deliver
    // "more than one dispute per payment" (a partial dispute for the frame,
    // then one for the rest), and the second must run the lost branch.
    if (order.dispute_outcome === 'lost' && order.dispute_id === dispute.id) return { kind: 'noop' };
    const reversalAlreadyExists = !!order.stripe_reversal_id || (dispute.transferAmountReversed ?? 0) > 0;
    // 'pending' is the default every order carries until the created handler
    // assesses it. Treating it as "not protected" reversed a compliant
    // artist's payout whenever `closed` outran `created`. With a reversal
    // already on the row nothing would be reversed anyway, so only the case
    // that could take money asks for the assessment.
    if (order.protection_status === 'pending' && !reversalAlreadyExists) return { kind: 'needs_assessment' };
    const platformAbsorbs = order.protection_status === 'protected';
    let reverseCents: number;
    if (platformAbsorbs) {
      reverseCents = 0;
    } else if (dispute.transferAmountReversed !== undefined) {
      // What Stripe says is still with the artist bounds the claw-back: the
      // disputed amount, never more than the payout minus what an earlier
      // refund or dispute already took back.
      reverseCents = disputeReversalCents(dispute.amount, order.artist_payout_cents - dispute.transferAmountReversed);
    } else {
      // Transfer not consulted: a recorded reversal is assumed to have taken
      // the whole payout (the settle route reverses exactly that). The route
      // re-selects with the transfer's figure before it moves any money.
      reverseCents = reversalAlreadyExists ? 0 : disputeReversalCents(dispute.amount, order.artist_payout_cents);
    }
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
