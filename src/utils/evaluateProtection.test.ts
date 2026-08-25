import { describe, it, expect } from 'vitest';
import {
  evaluateProtection,
  businessDaysBetween,
  ProtectionInput,
  SIGNATURE_REQUIRED_FROM_CENTS,
  MIN_CONDITION_NOTES_CHARS,
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

  // --- requirement 4: signature on high-value orders ---
  it('requires signature confirmation when the order is flagged for it', () => {
    const r = evaluateProtection(order({ signatureRequired: true, signatureConfirmed: false }));
    expect(r.status).toBe('ineligible');
    expect(r.failures.join(' ')).toMatch(/signature/i);
  });

  it('protects a high-value order once the signature is confirmed', () => {
    expect(evaluateProtection(order({ signatureRequired: true, signatureConfirmed: true })).status)
      .toBe('protected');
  });

  it('ignores signature state when it is not required', () => {
    expect(evaluateProtection(order({ signatureRequired: false, signatureConfirmed: false })).status)
      .toBe('protected');
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
