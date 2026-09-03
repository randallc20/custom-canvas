/**
 * The money split of a settled, artist-approved refund — extracted verbatim
 * from `api/admin/orders/[id]/refund/route.ts` so it can be pinned by tests
 * (05-P3 "tests", item 3). No behaviour change: same expressions, same order,
 * same rounding.
 *
 * Policy (DECISIONS.md 2026-07-06, tax component added 2026-08-18): the buyer
 * gets the artwork price + shipping + THEIR tax back — the platform is
 * merchant of record, so tax on refunded lines must be returned. The service
 * fee and the tax on it are never refunded.
 *
 * Tax was charged on three lines (price, shipping, fee) at one uniform rate,
 * so the fee's share of the tax is proportional to the fee's share of the
 * taxed base. `Math.round` on that share is the only rounding: the buyer
 * absorbs at most a half-cent either way, and the fee's tax is what stays.
 */
export type RefundSplitInput = {
  amount_cents: number;
  shipping_cents: number;
  buyer_fee_cents: number;
  amount_tax_cents: number;
};

export type RefundSplit = {
  /** Price + shipping + fee: everything the tax was charged on. */
  taxedBase: number;
  /** The tax attributable to the service fee — retained by the platform. */
  feeTax: number;
  /** The tax returned to the buyer. */
  refundTax: number;
  /** What Stripe is asked to refund. */
  refundAmount: number;
};

export function calculateRefundSplit(order: RefundSplitInput): RefundSplit {
  const taxedBase = order.amount_cents + order.shipping_cents + order.buyer_fee_cents;
  const feeTax = taxedBase > 0 ? Math.round((order.amount_tax_cents * order.buyer_fee_cents) / taxedBase) : 0;
  const refundTax = Math.max(0, order.amount_tax_cents - feeTax);
  const refundAmount = order.amount_cents + order.shipping_cents + refundTax;
  return { taxedBase, feeTax, refundTax, refundAmount };
}
