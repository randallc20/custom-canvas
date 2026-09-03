import { describe, expect, it } from 'vitest';
import { cancelUnshippedReason } from './cancelReason';
import { calculateRefundSplit, isFaultRefund } from './refundSplit';

const ORDER = { amount_cents: 2000, shipping_cents: 500, buyer_fee_cents: 106, amount_tax_cents: 215 };

describe('cancelUnshippedReason', () => {
  it('is a fault reason on an ordinary buyer cancellation', () => {
    expect(cancelUnshippedReason({}, 'buyer')).toBe('not_shipped');
    expect(isFaultRefund(cancelUnshippedReason({}, 'buyer'))).toBe(true);
  });

  it('records an artist stopping their own sale as artist_cancelled', () => {
    expect(cancelUnshippedReason({}, 'artist')).toBe('artist_cancelled');
  });

  it('is a fault reason when the platform cancels an abandoned order', () => {
    expect(cancelUnshippedReason({}, 'platform')).toBe('not_shipped');
  });

  it('follows the artist’s approval instead of the door', () => {
    // The defect this exists to stop, found at all three doors. A buyer whose
    // change-of-mind refund was approved on day six could press Cancel once
    // the ship-by passed and be handed the service fee as well — on the one
    // order where the product had just told the artist not to ship.
    const approved = { refund_approved_at: '2026-09-03T00:00:00Z', refund_reason: 'change_of_mind' };
    expect(cancelUnshippedReason(approved, 'buyer')).toBe('change_of_mind');
    expect(isFaultRefund(cancelUnshippedReason(approved, 'buyer'))).toBe(false);

    // And the money actually differs: the fee and its tax stay behind.
    const asFault = calculateRefundSplit(ORDER, 'not_shipped').refundAmount;
    const asApproved = calculateRefundSplit(ORDER, cancelUnshippedReason(approved, 'buyer')).refundAmount;
    expect(asFault - asApproved).toBe(106 + 9);
  });

  it('keeps a fault reason the artist approved, rather than downgrading it', () => {
    const approved = { refund_approved_at: '2026-09-03T00:00:00Z', refund_reason: 'not_as_described' };
    expect(cancelUnshippedReason(approved, 'buyer')).toBe('not_as_described');
    expect(isFaultRefund(cancelUnshippedReason(approved, 'buyer'))).toBe(true);
  });

  it('falls back to the door when an approval carries no reason', () => {
    const approved = { refund_approved_at: '2026-09-03T00:00:00Z', refund_reason: null };
    expect(cancelUnshippedReason(approved, 'buyer')).toBe('not_shipped');
  });
});
