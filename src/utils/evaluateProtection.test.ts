import { describe, it, expect } from 'vitest';
import {
  evaluateProtection,
  businessDaysBetween,
  ProtectionInput,
  SIGNATURE_REQUIRED_FROM_CENTS,
  SIGNATURE_CONFIRMATION_AVAILABLE,
  MIN_CONDITION_NOTES_CHARS,
  addBusinessDays,
} from './evaluateProtection';

// A Monday, so window arithmetic in the fixtures is easy to reason about.
const CREATED = '2026-08-03T12:00:00.000Z';

function order(overrides: Partial<ProtectionInput> = {}): ProtectionInput {
  return {
    isPickup: false,
    createdAt: CREATED,
    shippedAt: '2026-08-05T12:00:00.000Z', // Wednesday, 2 business days
    deliveredAt: '2026-08-10T12:00:00.000Z',
    trackingNumber: '9400111899223197428490',
    carrier: 'usps',
    signatureRequired: false,
    signatureConfirmed: false,
    evidencePhotoCount: 4,
    evidenceHasConditionNotes: true,
    fulfillmentWindowDays: 5,
    artistRepliedWithinWindow: true,
    ...overrides,
  };
}

describe('businessDaysBetween', () => {
  it('counts weekdays only', () => {
    // Mon 3rd -> Wed 5th = 2
    expect(businessDaysBetween(CREATED, '2026-08-05T12:00:00.000Z')).toBe(2);
  });

  it('skips the weekend', () => {
    // Fri 7th -> Mon 10th = 1 business day, not 3
    expect(businessDaysBetween('2026-08-07T12:00:00.000Z', '2026-08-10T12:00:00.000Z')).toBe(1);
  });

  it('returns 0 when the end is not after the start', () => {
    expect(businessDaysBetween(CREATED, CREATED)).toBe(0);
    expect(businessDaysBetween('2026-08-10T00:00:00.000Z', CREATED)).toBe(0);
  });
});

describe('evaluateProtection', () => {
  it('protects an order that meets every requirement', () => {
    const r = evaluateProtection(order());
    expect(r.status).toBe('protected');
    expect(r.failures).toEqual([]);
  });

  // --- requirement 1: fulfillment window ---
  it('fails when never shipped', () => {
    const r = evaluateProtection(order({ shippedAt: null }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/never marked shipped/i);
  });

  it('fails when shipped outside the window', () => {
    // Mon 3rd -> Tue 11th = 6 business days, window is 5
    const r = evaluateProtection(order({ shippedAt: '2026-08-11T12:00:00.000Z' }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/fulfillment window/i);
  });

  it('allows shipping exactly on the window boundary', () => {
    // Mon 3rd -> Mon 10th = 5 business days, exactly the window
    expect(evaluateProtection(order({ shippedAt: '2026-08-10T12:00:00.000Z' })).status)
      .toBe('protected');
  });

  // --- requirement 2: tracking + supported carrier ---
  it('fails without a tracking number', () => {
    expect(evaluateProtection(order({ trackingNumber: null })).status).toBe('ineligible');
    expect(evaluateProtection(order({ trackingNumber: '   ' })).status).toBe('ineligible');
  });

  it('fails on an unsupported carrier', () => {
    const r = evaluateProtection(order({ carrier: 'royal-mail' }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/supported carrier/i);
  });

  it('accepts each supported carrier', () => {
    for (const c of ['usps', 'ups', 'fedex', 'dhl']) {
      expect(evaluateProtection(order({ carrier: c })).status).toBe('protected');
    }
  });

  // --- requirement 3: delivery ---
  it('fails when delivery was never confirmed', () => {
    expect(evaluateProtection(order({ deliveredAt: null })).status).toBe('ineligible');
  });

  // --- requirement 4: signature on high-value orders — ACTIVE (D7) ---
  //
  // D6 waived this on 2026-09-02 because nothing could record it. D7
  // (2026-09-03) supersedes that: the counsel set requires it, and an admin
  // now records it from the carrier's record through
  // POST /api/admin/orders/[id]/signature-confirmed.
  it('ships with requirement 4 ACTIVE: SIGNATURE_CONFIRMATION_AVAILABLE is true (D7)', () => {
    expect(SIGNATURE_CONFIRMATION_AVAILABLE).toBe(true);
  });

  it('refuses a $1,200 order with no signature recorded, naming requirement 4', () => {
    // A $1,200 piece crosses the threshold, so checkout snapshots
    // signature_required = true.
    const signatureRequired = 120_000 >= SIGNATURE_REQUIRED_FROM_CENTS;
    expect(signatureRequired).toBe(true);

    const r = evaluateProtection(order({ signatureRequired, signatureConfirmed: false }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/signature confirmation on orders of \$750 or more/i);
    // The wording must say who records it. An artist reading this in Studio
    // has no control to click, and telling them to "add signature
    // confirmation" after the piece has shipped would be advice they cannot
    // act on — ProtectionBadge keys on the word "signature" to keep this out
    // of the "To protect this order" list for the same reason.
    expect(r.failures.join(' ')).toMatch(/Custom Canvas records it/i);
  });

  it('protects a $1,200 order once the signature is recorded', () => {
    const r = evaluateProtection(order({ signatureRequired: true, signatureConfirmed: true }));
    expect(r.status).toBe('protected');
    expect(r.failures).toEqual([]);
  });

  it('ignores signature state below the threshold', () => {
    expect(
      evaluateProtection(order({ signatureRequired: false, signatureConfirmed: false })).status
    ).toBe('protected');
  });

  it('still honours an explicit waiver, so the ruling can be reversed without a code change', () => {
    expect(
      evaluateProtection(order({ signatureRequired: true, signatureConfirmed: false }), {
        signatureConfirmationAvailable: false,
      }).status
    ).toBe('protected');
  });

  // --- requirement 5: listing evidence, snapshotted ---
  it('fails with fewer than three photos', () => {
    const r = evaluateProtection(order({ evidencePhotoCount: 2 }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/photograph/i);
  });

  it('protects at exactly three photos', () => {
    expect(evaluateProtection(order({ evidencePhotoCount: 3 })).status).toBe('protected');
  });

  it('fails without condition notes', () => {
    const r = evaluateProtection(order({ evidenceHasConditionNotes: false }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/condition notes/i);
  });

  // --- requirement 6: responsiveness ---
  it('fails when a buyer message went unanswered too long', () => {
    const r = evaluateProtection(order({ artistRepliedWithinWindow: false }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/unanswered/i);
  });

  // --- pickup short-circuit ---
  it('protects a pickup order when handoff was confirmed, ignoring shipping requirements', () => {
    const r = evaluateProtection(
      order({
        isPickup: true,
        pickupHandoffConfirmed: true,
        shippedAt: null,
        deliveredAt: null,
        trackingNumber: null,
        carrier: null,
        evidencePhotoCount: 0,
      })
    );
    expect(r.status).toBe('protected');
    expect(r.failures).toEqual([]);
  });

  it('fails a pickup order with no confirmed handoff', () => {
    const r = evaluateProtection(order({ isPickup: true, pickupHandoffConfirmed: false }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/handoff/i);
  });

  // --- reporting ---
  it('reports every failure, not just the first, so the artist can fix all of them', () => {
    const r = evaluateProtection(
      order({ shippedAt: null, trackingNumber: null, carrier: null, deliveredAt: null, evidencePhotoCount: 0 })
    );
    expect(r.status).toBe('ineligible');
    expect(r.failures.length).toBeGreaterThanOrEqual(5);
  });

  it('exposes the thresholds the policy text quotes', () => {
    expect(SIGNATURE_REQUIRED_FROM_CENTS).toBe(75_000);
    expect(MIN_CONDITION_NOTES_CHARS).toBe(150);
  });
});

/** L7 — the ship-by date shown to a buyer and measured by the cron. It must
 *  be the exact inverse of businessDaysBetween, because the same window
 *  decides seller-protection requirement 1. */
describe('addBusinessDays', () => {
  it('is the inverse of businessDaysBetween', () => {
    for (const start of ['2026-09-01T12:00:00Z', '2026-09-04T23:00:00Z', '2026-09-05T01:00:00Z', '2026-09-06T09:00:00Z']) {
      for (const n of [1, 3, 5, 10]) {
        expect(businessDaysBetween(start, addBusinessDays(start, n))).toBe(n);
      }
    }
  });

  it('skips the weekend', () => {
    // Friday 2026-09-04 + 1 business day = Monday 2026-09-07.
    expect(addBusinessDays('2026-09-04T12:00:00Z', 1).slice(0, 10)).toBe('2026-09-07');
    // Friday + 5 = the following Friday.
    expect(addBusinessDays('2026-09-04T12:00:00Z', 5).slice(0, 10)).toBe('2026-09-11');
  });

  it('starting on a Saturday lands on the next weekday', () => {
    expect(addBusinessDays('2026-09-05T12:00:00Z', 1).slice(0, 10)).toBe('2026-09-07');
  });

  it('returns the same instant for zero or negative days', () => {
    const start = '2026-09-01T12:00:00Z';
    expect(Date.parse(addBusinessDays(start, 0))).toBe(Date.parse(start));
    expect(Date.parse(addBusinessDays(start, -3))).toBe(Date.parse(start));
  });

  it('does not crash on a bad date', () => {
    expect(addBusinessDays('not-a-date', 5)).toBe('not-a-date');
  });
});
