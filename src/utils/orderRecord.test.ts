import { describe, it, expect } from 'vitest';
import { buildOrderRecord } from './orderRecord';

function mockSession(overrides: Partial<{
  listing_id: string;
  buyer_id: string;
  shipping_address: string;
  shipping_cents: string;
  price_cents: string;
  buyer_fee_cents: string;
  artist_payout_cents: string;
  platform_fee_cents: string;
}> = {}, amountTax?: number, collected?: unknown) {
  return {
    payment_intent: 'pi_test_123',
    metadata: {
      listing_id: 'listing-1',
      buyer_id: 'buyer-1',
      shipping_address: JSON.stringify({ street: '123 Main St', city: 'Houston', state: 'TX', zip: '77001', country: 'US' }),
      shipping_cents: '2000',
      price_cents: '30000',
      buyer_fee_cents: '1500',
      ...overrides,
    },
    total_details: amountTax === undefined ? null : { amount_tax: amountTax },
    ...(collected === undefined ? {} : { collected_information: collected }),
  };
}

describe('buildOrderRecord (webhook order-creation math)', () => {
  it('builds a correct order for a $300 sale with $20 shipping', () => {
    const order = buildOrderRecord(mockSession(), 'artist-1');
    expect(order).not.toBeNull();
    expect(order!.amount_cents).toBe(30000);
    expect(order!.shipping_cents).toBe(2000);
    expect(order!.buyer_fee_cents).toBe(1500); // session-locked fee
    expect(order!.artist_payout_cents).toBe(27500);
    expect(order!.platform_fee_cents).toBe(4500); // 15% commission ONLY — the buyer fee is a Stripe pass-through, not revenue
    expect(order!.amount_tax_cents).toBe(0); // no tax details on the session
    expect(order!.stripe_payment_intent_id).toBe('pi_test_123');
    expect(order!.status).toBe('paid');
    expect(order!.shipping_address).toEqual({
      street: '123 Main St', city: 'Houston', state: 'TX', zip: '77001', country: 'US',
    });
  });

  it('captures Stripe Tax totals for merchant-of-record refunds', () => {
    // 8.25% on $335 buyer total ≈ $27.64
    const order = buildOrderRecord(mockSession({}, 2764), 'artist-1');
    expect(order!.amount_tax_cents).toBe(2764);
  });

  it('uses the session-locked price — the webhook never reads the live listing', () => {
    // Artist raised the price to $500 after the buyer opened checkout; the
    // session (and Stripe's charge) locked $300.
    const order = buildOrderRecord(mockSession({ price_cents: '30000' }), 'artist-1');
    expect(order!.amount_cents).toBe(30000);
    expect(order!.artist_payout_cents).toBe(27500);
  });

  it('records the session-locked buyer fee, not the current formula', () => {
    // Session created under an old fee completes after a deploy that changed
    // the formula: the order must record what Stripe charged.
    const order = buildOrderRecord(
      mockSession({ price_cents: '5000', shipping_cents: '0', buyer_fee_cents: '1000' }),
      'artist-1'
    );
    expect(order!.buyer_fee_cents).toBe(1000);
    expect(order!.platform_fee_cents).toBe(750); // 15% commission only
    const buyerTotal = order!.amount_cents + order!.buyer_fee_cents + order!.shipping_cents;
    // Money conservation under the pass-through model: what the buyer pays =
    // artist payout + platform commission + the fee handed to Stripe.
    expect(order!.artist_payout_cents + order!.platform_fee_cents + order!.buyer_fee_cents).toBe(buyerTotal);
  });

  it('returns null when money metadata is missing — never fabricates amounts', () => {
    // The refund flow's exact payout reversal depends on recorded amounts
    // matching what Stripe moved; fabricated fallbacks could mis-record.
    expect(buildOrderRecord(mockSession({ buyer_fee_cents: '' }), 'artist-1')).toBeNull();
    expect(buildOrderRecord(mockSession({ price_cents: '' }), 'artist-1')).toBeNull();
  });

  it('handles pickup orders: no shipping, no address', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: '0', shipping_address: '', price_cents: '15000', buyer_fee_cents: '750' }),
      'artist-1'
    );
    expect(order!.shipping_cents).toBe(0);
    expect(order!.shipping_address).toBeNull();
    expect(order!.artist_payout_cents).toBe(12750);
    expect(order!.platform_fee_cents).toBe(2250); // 15% commission only
  });

  it('defaults malformed shipping_cents to 0', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: 'not-a-number', price_cents: '10000', buyer_fee_cents: '500' }),
      'artist-1'
    );
    expect(order!.shipping_cents).toBe(0);
    expect(order!.artist_payout_cents).toBe(8500);
  });

  it('returns null when metadata is missing ids', () => {
    expect(
      buildOrderRecord({ payment_intent: 'pi_x', metadata: { listing_id: 'l1' } }, 'a1')
    ).toBeNull();
    expect(
      buildOrderRecord({ payment_intent: 'pi_x', metadata: null }, 'a1')
    ).toBeNull();
  });

  it('records the session-locked payout, not a recomputed one', () => {
    // The transfer Stripe made is fixed at session creation. If PLATFORM_RATE
    // is deployed mid-checkout, recomputing here would diverge from the money
    // that actually moved and corrupt the refund reversal.
    const order = buildOrderRecord(
      mockSession({ artist_payout_cents: '27500', platform_fee_cents: '4500' }),
      'artist-1'
    );
    expect(order!.artist_payout_cents).toBe(27500);
    expect(order!.platform_fee_cents).toBe(4500);
  });

  it('honors a locked payout that disagrees with the current formula', () => {
    // Session created at a 15% rate; a 20% rate is live by webhook time.
    // Stripe moved 27500 -- that is what must be recorded.
    const order = buildOrderRecord(
      mockSession({ artist_payout_cents: '27500', platform_fee_cents: '4500' }),
      'artist-1'
    );
    expect(order!.artist_payout_cents).toBe(27500);
    expect(order!.artist_payout_cents + order!.platform_fee_cents).toBe(32000);
  });

  it('falls back to the formula for sessions predating the locked keys', () => {
    // In-flight-at-deploy sessions have no locked payout; they must still
    // build (returning null here would 500 the webhook forever).
    const order = buildOrderRecord(mockSession(), 'artist-1');
    expect(order).not.toBeNull();
    expect(order!.artist_payout_cents).toBe(27500);
    expect(order!.platform_fee_cents).toBe(4500);
  });

  it('records the address Stripe collected and taxed, over the app metadata copy', () => {
    const order = buildOrderRecord(
      mockSession({}, 2764, {
        shipping_details: {
          name: 'Dana Buyer',
          address: { line1: '900 Elm St', line2: 'Apt 4', city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
        },
      }),
      'artist-1'
    );
    expect(order!.shipping_address).toEqual({
      name: 'Dana Buyer', street: '900 Elm St, Apt 4', city: 'Austin',
      state: 'TX', zip: '78701', country: 'US',
    });
  });

  it('falls back to metadata when Stripe collected no address (pickup / legacy)', () => {
    const order = buildOrderRecord(mockSession(), 'artist-1');
    expect(order!.shipping_address).toEqual({
      street: '123 Main St', city: 'Houston', state: 'TX', zip: '77001', country: 'US',
    });
  });

  it('conserves money: payout + platform fee = buyer total components', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: '1234', price_cents: '33333' }),
      'artist-1'
    );
    const buyerTotal = order!.amount_cents + order!.buyer_fee_cents + order!.shipping_cents;
    expect(order!.artist_payout_cents + order!.platform_fee_cents + order!.buyer_fee_cents).toBe(buyerTotal);
  });
});
