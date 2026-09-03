// Pure return logic — no I/O, no server-only imports, so the buyer's Orders
// page and the admin page can use it as well as the routes. Splitting this
// out of src/lib/orderReturns.ts is not cosmetic: that module reaches for the
// service-role client and the mailer, and importing it from a client
// component would pull both into the browser bundle (L8).

import type { RefundReason } from './refundSplit';

/** Ship the return within seven CALENDAR days of authorisation (Terms of Sale
 *  §5 — calendar, not business days, unlike every other window in the
 *  product). */
export const RETURN_SHIP_BY_DAYS = 7;

export type ReturnAddress = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
};

/**
 * Whether a return is required by default for a given refund reason (L8).
 *
 * The documents draw this by what actually happened:
 *  - change of mind: the buyer has the piece and wants their money, so it
 *    comes back. Required.
 *  - never shipped / lost in transit: there is nothing to return. Not
 *    required, and asking would be absurd.
 *  - damaged / not as described: required by default but waivable — a
 *    smashed canvas may be unsafe or pointless to ship back, which is
 *    exactly what "unsafe" and "unnecessary" are for.
 *  - platform error / artist cancelled: usually pre-shipment. Not required.
 */
export function returnRequiredByDefault(reason: RefundReason, hasThePiece = true): boolean {
  // Nothing to return if it never left the artist. The r5 money pass found
  // this: a change-of-mind refund approved on an unshipped order authorised a
  // return for a painting still on the artist's wall, emailed the buyer the
  // artist's street address, started a seven-day clock — and then blocked
  // every settle door, because the gate is (correctly) inside settleRefund,
  // so the admin's settle, the artist's cancel and the cron all 409'd until
  // someone thought to waive it.
  if (!hasThePiece) return false;

  switch (reason) {
    case 'change_of_mind':
    case 'damaged':
    case 'not_as_described':
      return true;
    default:
      return false;
  }
}

/** Who ordinarily bears return shipping, in the documents' words. Ruling D10
 *  keeps this INFORMATIONAL at launch: the platform buys no labels, so this
 *  is a sentence in the instructions, not a charge. */
export function returnShippingBearer(reason: RefundReason): 'buyer' | 'artist' {
  return reason === 'change_of_mind' ? 'buyer' : 'artist';
}

export type ReturnRecord = {
  id: string;
  order_id: string;
  required: boolean;
  reason: RefundReason | null;
  authorized_at: string | null;
  return_address: ReturnAddress | null;
  ship_by: string | null;
  instructions: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_back_at: string | null;
  received_at: string | null;
  inspection_outcome: 'accepted' | 'rejected' | null;
  inspection_notes: string | null;
  waived_at: string | null;
  waived_reason: 'unlawful' | 'unsafe' | 'impracticable' | 'unnecessary' | null;
};

/**
 * The settle gate.
 *
 * "The refund may be issued after delivery and reasonable inspection of the
 * returned artwork" — so when a return is required and has neither been
 * accepted on inspection nor waived, the money does not move. Without this
 * the buyer keeps the piece AND the money, which is the one outcome the
 * documents are explicit about preventing ("you may not keep both").
 *
 * Returns null when settling is allowed.
 */
export function returnBlocksSettlement(ret: ReturnRecord | null): string | null {
  if (!ret) return null;
  if (!ret.required) return null;
  if (ret.waived_at) return null;
  if (ret.inspection_outcome === 'accepted') return null;

  if (ret.inspection_outcome === 'rejected') {
    return 'The returned artwork was rejected on inspection. Decide with support what the buyer is owed before settling — the documents make the refund conditional on a reasonable inspection, and this one did not pass.';
  }
  if (ret.received_at) {
    return 'The return has arrived but has not been inspected. Record the inspection outcome first.';
  }
  if (ret.shipped_back_at) {
    return 'The buyer has shipped the piece back but it has not been received and inspected yet.';
  }
  return 'This refund is conditioned on the artwork being returned. Wait for it and inspect it, or waive the return with a reason.';
}

export function formatAddress(a: ReturnAddress): string {
  return [a.name, a.street, `${a.city}, ${a.state} ${a.zip}`, a.country && a.country !== 'US' ? a.country : null]
    .filter(Boolean)
    .join('\n');
}
