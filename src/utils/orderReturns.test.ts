import { describe, expect, it } from 'vitest';
import {
  returnBlocksSettlement,
  returnRequiredByDefault,
  returnShippingBearer,
  formatAddress,
  type ReturnRecord,
} from './orderReturns';
import { REFUND_REASONS } from './refundSplit';
import { buyerTookPossession, pickupPossessionUnknown, pieceIsWithArtist } from './fulfillment';

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

/**
 * r5 money pass, P1: a change-of-mind refund approved on an order that had
 * not shipped authorised a return for a piece still on the artist's wall —
 * emailing the buyer the artist's street address, starting a seven-day clock,
 * and then blocking every settle door, because the gate is (correctly) inside
 * settleRefund. The buyer's money only moved when someone thought to waive it.
 */
describe('returnRequiredByDefault — nothing to return before it ships', () => {
  it('never requires a return when the buyer does not have the piece', () => {
    for (const r of REFUND_REASONS) {
      expect(returnRequiredByDefault(r, false)).toBe(false);
    }
  });

  it('still requires one for a change of mind once it has shipped', () => {
    expect(returnRequiredByDefault('change_of_mind', true)).toBe(true);
    expect(returnRequiredByDefault('change_of_mind', false)).toBe(false);
  });

  it('defaults to "the buyer has it", so existing callers are unchanged', () => {
    expect(returnRequiredByDefault('change_of_mind')).toBe(true);
  });
});

/**
 * r6 money pass, P0. Fixing r5's "no return on an unshipped order" by making
 * possession mean `!!shipped_at` broke LOCAL PICKUP: a pickup order never has
 * a shipped_at, not even after the buyer has walked out of the studio with
 * the painting. A change-of-mind refund then required no return at all, and
 * the buyer kept the artwork AND the money — the exact outcome Terms of Sale
 * §5 ("you may not keep both") exists to prevent.
 */
describe('possession, not shipment (r6 P0)', () => {
  it('a collected pickup piece must come back', () => {
    expect(buyerTookPossession({ is_pickup: true, status: 'delivered' })).toBe(true);
    expect(
      buyerTookPossession({
        is_pickup: true,
        status: 'paid',
        pickup_confirmed_by_buyer_at: '2026-09-01T12:00:00Z',
        pickup_confirmed_by_artist_at: '2026-09-01T12:05:00Z',
      }),
    ).toBe(true);
    expect(returnRequiredByDefault('change_of_mind', true)).toBe(true);
  });

  it('a pickup nobody has confirmed at all is UNKNOWN, not "not collected"', () => {
    const nobodyConfirmed = { is_pickup: true, status: 'paid' };
    expect(buyerTookPossession(nobodyConfirmed)).toBe(false);
    // …but that is not the same as knowing the piece is still in the studio,
    // and the artist is asked (r7 P0).
    expect(pickupPossessionUnknown(nobodyConfirmed)).toBe(true);
  });

  it('EITHER confirmation counts as possession (r7 P0)', () => {
    // Requiring both put possession behind a voluntary button the refunding
    // buyer controls: collect the piece, never tap Confirm, and the refund
    // needed no return.
    expect(
      buyerTookPossession({ is_pickup: true, status: 'paid', pickup_confirmed_by_artist_at: '2026-09-01T12:00:00Z' }),
    ).toBe(true);
    expect(
      buyerTookPossession({ is_pickup: true, status: 'paid', pickup_confirmed_by_buyer_at: '2026-09-01T12:00:00Z' }),
    ).toBe(true);
    // And then it is no longer unknown.
    expect(
      pickupPossessionUnknown({ is_pickup: true, status: 'paid', pickup_confirmed_by_artist_at: '2026-09-01T12:00:00Z' }),
    ).toBe(false);
  });

  it('a shipped piece has, and an unshipped shipping order has not', () => {
    expect(buyerTookPossession({ shipped_at: '2026-09-01T12:00:00Z' })).toBe(true);
    expect(buyerTookPossession({ is_pickup: false, status: 'paid' })).toBe(false);
  });
});

/**
 * r7 auth pass, P0. Possession has three states, not two, and the relist
 * sites were using the two-state version: a pickup order neither party
 * confirmed read as "the artist has it" for the relist while the return gate
 * read the same row as "the buyer might", so the painting went back on sale
 * AND a return was demanded for it.
 */
describe('the three states of possession', () => {
  const buyerHasIt = { is_pickup: true, status: 'paid', pickup_confirmed_by_artist_at: '2026-09-01T12:00:00Z' };
  const artistHasIt = { is_pickup: false, status: 'paid' };
  const nobodyKnows = { is_pickup: true, status: 'paid' };

  it('only relists when the artist is confidently still holding it', () => {
    expect(pieceIsWithArtist(artistHasIt)).toBe(true);
    expect(pieceIsWithArtist(buyerHasIt)).toBe(false);
    // The state the last two rounds were spent creating.
    expect(pieceIsWithArtist(nobodyKnows)).toBe(false);
  });

  it('the relist and the return gate agree on every state', () => {
    for (const order of [buyerHasIt, artistHasIt, nobodyKnows]) {
      const gateWantsItBack = buyerTookPossession(order) || pickupPossessionUnknown(order);
      // Never both "give it back" and "put it on sale".
      expect(gateWantsItBack && pieceIsWithArtist(order)).toBe(false);
      // And never neither: every state is decided.
      expect(gateWantsItBack || pieceIsWithArtist(order)).toBe(true);
    }
  });

  it('a shipped piece is never with the artist', () => {
    expect(pieceIsWithArtist({ shipped_at: '2026-09-01T12:00:00Z' })).toBe(false);
  });
});

/**
 * r10 money / r8 auth, P1. The artist answers "the buyer never collected this
 * piece" at the approval door; the settle door used to re-derive possession
 * from the row and reach the opposite conclusion, so an uncollected pickup
 * refund could never settle and the only unblock emailed the buyer a return
 * address for a piece they never had. The answer is now recorded as a return
 * record with required=false, and these are the two states the gate must read
 * the same way the approval did.
 */
describe('a recorded decision beats a re-derivation (r10 P1)', () => {
  const recorded = (required: boolean): ReturnRecord => ({
    ...base,
    required,
    authorized_at: '2026-09-03T12:00:00Z',
  });

  it('a recorded "no return needed" lets the settle through', () => {
    expect(returnBlocksSettlement(recorded(false), true)).toBeNull();
  });

  it('a recorded "return needed" still blocks until it comes back', () => {
    expect(returnBlocksSettlement(recorded(true), false)).toMatch(/conditioned on the artwork being returned/i);
  });

  it('only an ABSENT record falls back to the reason default', () => {
    expect(returnBlocksSettlement(null, true)).toMatch(/should be conditioned/i);
    expect(returnBlocksSettlement(null, false)).toBeNull();
  });
});
