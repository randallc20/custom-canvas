import { describe, it, expect } from 'vitest';
import { buildOrderRecord } from './orderRecord';

function mockSession(overrides: Partial<{
  listing_id: string;
  buyer_id: string;
  shipping_address: string;
  shipping_cents: string;
  price_cents: string;
}> = {}) {
  return {
    payment_intent: 'pi_test_123',
    metadata: {
      listing_id: 'listing-1',
      buyer_id: 'buyer-1',
      shipping_address: JSON.stringify({ street: '123 Main St', city: 'Houston', state: 'TX', zip: '77001', country: 'US' }),
      shipping_cents: '2000',
      price_cents: '30000',
      ...overrides,
    },
  };
}

describe('buildOrderRecord (webhook order-creation math)', () => {
  it('builds a correct order for a $300 sale with $20 shipping', () => {
    const order = buildOrderRecord(mockSession(), { price_cents: 30000 }, 'artist-1');
    expect(order).not.toBeNull();
    expect(order!.amount_cents).toBe(30000);
    expect(order!.shipping_cents).toBe(2000);
    expect(order!.buyer_fee_cents).toBe(1000);
    expect(order!.artist_payout_cents).toBe(27500);
    expect(order!.platform_fee_cents).toBe(5500); // commission + buyer fee
    expect(order!.stripe_payment_intent_id).toBe('pi_test_123');
    expect(order!.status).toBe('paid');
    expect(order!.shipping_address).toEqual({
      street: '123 Main St', city: 'Houston', state: 'TX', zip: '77001', country: 'US',
    });
  });

  it('uses the session-locked price, not the live listing price', () => {
    // Artist raised the price to $500 after the buyer opened checkout; the
    // session (and Stripe's charge) locked $300.
    const order = buildOrderRecord(mockSession({ price_cents: '30000' }), { price_cents: 50000 }, 'artist-1');
    expect(order!.amount_cents).toBe(30000);
    expect(order!.artist_payout_cents).toBe(27500);
  });

  it('falls back to the listing price when metadata lacks price_cents (legacy sessions)', () => {
    const order = buildOrderRecord(mockSession({ price_cents: '' }), { price_cents: 15000 }, 'artist-1');
    expect(order!.amount_cents).toBe(15000);
    expect(order!.artist_payout_cents).toBe(12750 + 2000);
  });

  it('handles pickup orders: no shipping, no address', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: '0', shipping_address: '', price_cents: '15000' }),
      { price_cents: 15000 },
      'artist-1'
    );
    expect(order!.shipping_cents).toBe(0);
    expect(order!.shipping_address).toBeNull();
    expect(order!.artist_payout_cents).toBe(12750);
    expect(order!.platform_fee_cents).toBe(3250);
  });

  it('defaults malformed shipping_cents to 0', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: 'not-a-number', price_cents: '10000' }),
      { price_cents: 10000 },
      'artist-1'
    );
    expect(order!.shipping_cents).toBe(0);
    expect(order!.artist_payout_cents).toBe(8500);
  });

  it('returns null when metadata is missing ids', () => {
    expect(
      buildOrderRecord({ payment_intent: 'pi_x', metadata: { listing_id: 'l1' } }, { price_cents: 1000 }, 'a1')
    ).toBeNull();
    expect(
      buildOrderRecord({ payment_intent: 'pi_x', metadata: null }, { price_cents: 1000 }, 'a1')
    ).toBeNull();
  });

  it('conserves money: payout + platform fee = buyer total components', () => {
    const order = buildOrderRecord(
      mockSession({ shipping_cents: '1234', price_cents: '33333' }),
      { price_cents: 33333 },
      'artist-1'
    );
    const buyerTotal = order!.amount_cents + order!.buyer_fee_cents + order!.shipping_cents;
    expect(order!.artist_payout_cents + order!.platform_fee_cents).toBe(buyerTotal);
  });
});
