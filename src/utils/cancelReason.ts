import type { RefundReason } from './refundSplit';

/**
 * Which refund reason an unshipped-order cancellation settles under.
 *
 * The reason is not a label — it IS the split. `not_shipped` and
 * `artist_cancelled` are FAULT reasons, so they return the whole charge
 * including the service fee and the tax on it; `change_of_mind` retains both.
 *
 * Ordinarily a cancellation is a fault refund, and rightly: a buyer who never
 * received a piece does not pay a fee for the transaction that did not happen.
 * The exception is an order whose refund the ARTIST has already approved.
 * Cancelling there is not a new decision — it is the buyer closing out one
 * already made, without waiting on a manual admin settle — so the money has to
 * follow the approval.
 *
 * This has now been a defect at all three doors. The cron converted an
 * approved change-of-mind refund into a full fault refund (r8 P1, fixed by
 * filtering approved orders out of the sweep); the artist's own Cancel button
 * did the same (r10 P2, fixed by refusing that branch); and the buyer's button
 * did it too, while the copy beside it actively recommended pressing it (r13
 * P1). One function so the fourth door, if there is one, cannot get it wrong.
 */
export function cancelUnshippedReason(order: {
  refund_approved_at?: string | null;
  refund_reason?: string | null;
}, by: 'buyer' | 'artist' | 'platform'): RefundReason {
  if (order.refund_approved_at && order.refund_reason) {
    return order.refund_reason as RefundReason;
  }
  return by === 'artist' ? 'artist_cancelled' : 'not_shipped';
}
