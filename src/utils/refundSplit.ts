/**
 * The money split of a settled refund.
 *
 * Extracted verbatim from `api/admin/orders/[id]/refund/route.ts` so it can be
 * pinned by tests (05-P3 "tests", item 3).
 *
 * Policy (DECISIONS.md 2026-07-06, tax component 2026-08-18, reason split
 * 2026-09-03 / L6): the buyer always gets the artwork price + shipping + the
 * tax on those lines back — the platform is merchant of record, so tax on
 * refunded lines must be returned. What changed in L6 is the service fee.
 *
 * Terms of Sale §2, Artist Agreement §8 and the Shipping policy all draw the
 * same line, and it was not in the code:
 *
 *  - **Change of mind** — a discretionary return the artist agreed to. The
 *    service fee and the tax on it are kept. This is what the code did for
 *    every refund.
 *  - **Fault** — never shipped, lost in transit, materially damaged,
 *    materially not as described, an obvious pricing/tax error (Terms of Sale
 *    §2A), or the artist cancelling before shipping. The WHOLE charge goes
 *    back, service fee and all of the tax included. The buyer did nothing and
 *    got nothing; charging them for the privilege is what the documents
 *    forbid.
 *
 * Tax was charged on three lines (price, shipping, fee) at one uniform rate,
 * so the fee's share of the tax is proportional to the fee's share of the
 * taxed base. `Math.round` on that share is the only rounding: the buyer
 * absorbs at most a half-cent either way, and the fee's tax is what stays.
 */

/** Why an order was refunded. Mirrors the CHECK on `orders.refund_reason`. */
export type RefundReason =
  | 'change_of_mind'
  | 'not_shipped'
  | 'lost_in_transit'
  | 'damaged'
  | 'not_as_described'
  | 'platform_error'
  | 'artist_cancelled';

export const REFUND_REASONS: RefundReason[] = [
  'change_of_mind',
  'not_shipped',
  'lost_in_transit',
  'damaged',
  'not_as_described',
  'platform_error',
  'artist_cancelled',
];

/** The reasons where the fault is ours or the artist's, so the buyer is made
 *  whole including the service fee — and where Custom Canvas refunds whether
 *  or not the artist agrees (Artist Agreement §8's four exceptions, plus the
 *  platform's own error and an artist-initiated cancellation). */
export function isFaultRefund(reason: RefundReason | null | undefined): boolean {
  return reason != null && reason !== 'change_of_mind';
}

/** Buyer-facing label for a settled refund. */
export function refundReasonLabel(reason: RefundReason | null | undefined): string {
  switch (reason) {
    case 'change_of_mind':
      return 'Refunded (change of mind — service fee retained)';
    case 'not_shipped':
      return 'Refunded in full — the piece was never shipped';
    case 'lost_in_transit':
      return 'Refunded in full — the piece was lost in transit';
    case 'damaged':
      return 'Refunded in full — the piece arrived damaged';
    case 'not_as_described':
      return 'Refunded in full — the piece was not as described';
    case 'platform_error':
      return 'Refunded in full — an error on our side';
    case 'artist_cancelled':
      return 'Refunded in full — the artist cancelled the order';
    default:
      // Orders refunded before L6 carry no reason. They were all settled
      // under the change-of-mind split, but say nothing rather than assert it.
      return 'Refunded';
  }
}

export type RefundSplitInput = {
  amount_cents: number;
  shipping_cents: number;
  buyer_fee_cents: number;
  amount_tax_cents: number;
};

export type RefundSplit = {
  /** Price + shipping + fee: everything the tax was charged on. */
  taxedBase: number;
  /** The tax attributable to the service fee. Retained on a change-of-mind
   *  refund, returned on a fault refund. */
  feeTax: number;
  /** The tax returned to the buyer. */
  refundTax: number;
  /** The service fee returned to the buyer: zero on change of mind. */
  refundFee: number;
  /** What Stripe is asked to refund. */
  refundAmount: number;
};

export function calculateRefundSplit(
  order: RefundSplitInput,
  /** Defaults to the discretionary split — the pre-L6 behaviour, and the
   *  right answer when a caller genuinely has no reason recorded. Callers
   *  that move money must pass one explicitly. */
  reason: RefundReason = 'change_of_mind',
): RefundSplit {
  const taxedBase = order.amount_cents + order.shipping_cents + order.buyer_fee_cents;
  const feeTax = taxedBase > 0 ? Math.round((order.amount_tax_cents * order.buyer_fee_cents) / taxedBase) : 0;

  if (isFaultRefund(reason)) {
    // The whole charge. Computed as the sum of its parts rather than as a
    // separate "total" field so it cannot drift from the change-of-mind
    // branch's understanding of what the buyer paid.
    return {
      taxedBase,
      feeTax,
      refundTax: order.amount_tax_cents,
      refundFee: order.buyer_fee_cents,
      refundAmount:
        order.amount_cents + order.shipping_cents + order.buyer_fee_cents + order.amount_tax_cents,
    };
  }

  const refundTax = Math.max(0, order.amount_tax_cents - feeTax);
  return {
    taxedBase,
    feeTax,
    refundTax,
    refundFee: 0,
    refundAmount: order.amount_cents + order.shipping_cents + refundTax,
  };
}
