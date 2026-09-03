import { describe, expect, it } from 'vitest';
import {
  returnBlocksSettlement,
  returnRequiredByDefault,
  returnShippingBearer,
  formatAddress,
  type ReturnRecord,
} from './orderReturns';
import { REFUND_REASONS } from './refundSplit';

/**
 * L8 — the settle gate. Terms of Sale §5: "the refund may be issued after
 * delivery and reasonable inspection of the returned artwork", and the buyer
 * "may not keep both". Before this, a refund settled the moment the artist
 * approved it, so a change-of-mind buyer kept the artwork AND the money.
 */
const base: ReturnRecord = {
  id: 'r1',
  order_id: 'o1',
  required: true,
  reason: 'change_of_mind',
  authorized_at: '2026-09-01T12:00:00Z',
  return_address: null,
  ship_by: '2026-09-08T12:00:00Z',
  instructions: null,
  tracking_number: null,
  carrier: null,
  shipped_back_at: null,
  received_at: null,
  inspection_outcome: null,
  inspection_notes: null,
  waived_at: null,
  waived_reason: null,
};

describe('returnBlocksSettlement — the matrix', () => {
  it('does not block when there is no return record at all', () => {
    // Most refunds: nothing to come back, or a pre-L8 order.
    expect(returnBlocksSettlement(null)).toBeNull();
  });

  it('does not block when the return is not required', () => {
    expect(returnBlocksSettlement({ ...base, required: false })).toBeNull();
  });

  it('BLOCKS an authorised return with nothing shipped back', () => {
    expect(returnBlocksSettlement(base)).toMatch(/conditioned on the artwork being returned/i);
  });

  it('BLOCKS while the piece is in transit back', () => {
    expect(
      returnBlocksSettlement({ ...base, shipped_back_at: '2026-09-03T12:00:00Z' }),
    ).toMatch(/has not been received and inspected/i);
  });

  it('BLOCKS when it has arrived but nobody has inspected it', () => {
    expect(
      returnBlocksSettlement({
        ...base,
        shipped_back_at: '2026-09-03T12:00:00Z',
        received_at: '2026-09-06T12:00:00Z',
      }),
    ).toMatch(/not been inspected/i);
  });

  it('allows settling once the inspection is accepted', () => {
    expect(
      returnBlocksSettlement({
        ...base,
        shipped_back_at: '2026-09-03T12:00:00Z',
        received_at: '2026-09-06T12:00:00Z',
        inspection_outcome: 'accepted',
      }),
    ).toBeNull();
  });

  it('still BLOCKS on a rejected inspection, and says why', () => {
    // Deliberately not an automatic outcome: the documents make the refund
    // conditional on a REASONABLE inspection, and one that failed is a
    // support conversation rather than a silent full refund.
    expect(
      returnBlocksSettlement({
        ...base,
        received_at: '2026-09-06T12:00:00Z',
        inspection_outcome: 'rejected',
      }),
    ).toMatch(/rejected on inspection/i);
  });

  it('allows settling once the return is waived', () => {
    expect(
      returnBlocksSettlement({ ...base, waived_at: '2026-09-02T12:00:00Z', waived_reason: 'unsafe' }),
    ).toBeNull();
  });

  it('a waiver beats an un-shipped requirement', () => {
    const waived = { ...base, waived_at: '2026-09-02T12:00:00Z', waived_reason: 'unnecessary' as const };
    expect(returnBlocksSettlement(waived)).toBeNull();
  });
});

describe('returnRequiredByDefault', () => {
  it('requires a return when the buyer has the piece', () => {
    expect(returnRequiredByDefault('change_of_mind')).toBe(true);
    expect(returnRequiredByDefault('damaged')).toBe(true);
    expect(returnRequiredByDefault('not_as_described')).toBe(true);
  });

  it('does not require one when there is nothing to return', () => {
    // Asking a buyer to return a piece that never arrived would be absurd.
    expect(returnRequiredByDefault('not_shipped')).toBe(false);
    expect(returnRequiredByDefault('lost_in_transit')).toBe(false);
    expect(returnRequiredByDefault('platform_error')).toBe(false);
    expect(returnRequiredByDefault('artist_cancelled')).toBe(false);
  });

  it('has an answer for every refund reason', () => {
    for (const r of REFUND_REASONS) {
      expect(typeof returnRequiredByDefault(r)).toBe('boolean');
    }
  });
});

describe('returnShippingBearer', () => {
  it('the buyer bears it on a change of mind, the artist on a fault', () => {
    // Artist Agreement §8: "You ordinarily bear reasonable return-shipping
    // costs ... where the artwork was damaged, materially misdescribed, or
    // incorrectly supplied; the buyer ordinarily bears them on an approved
    // change-of-mind return." Informational at launch (ruling D10) — no
    // labels are bought, so this is a sentence in the instructions.
    expect(returnShippingBearer('change_of_mind')).toBe('buyer');
    expect(returnShippingBearer('damaged')).toBe('artist');
    expect(returnShippingBearer('not_as_described')).toBe('artist');
  });
});

describe('formatAddress', () => {
  it('reads as an address a courier could use', () => {
    expect(
      formatAddress({ name: 'Nora Vance', street: '12 Bayou St', city: 'Houston', state: 'TX', zip: '77006' }),
    ).toBe('Nora Vance\n12 Bayou St\nHouston, TX 77006');
  });

  it('only prints a country when it is not the US', () => {
    expect(formatAddress({ name: 'A', street: 'B', city: 'C', state: 'D', zip: '12345', country: 'US' })).not.toMatch(/US/);
    expect(formatAddress({ name: 'A', street: 'B', city: 'C', state: 'D', zip: '12345', country: 'CA' })).toMatch(/CA$/);
  });
});
