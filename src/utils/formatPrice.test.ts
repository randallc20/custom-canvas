import { describe, it, expect } from 'vitest';
import { listingPriceLabel } from './formatPrice';

describe('listingPriceLabel', () => {
  const base = { status: 'available', price_cents: 30000, price_visible: true };

  it('shows the price for a normal available listing', () => {
    expect(listingPriceLabel(base)).toBe('$300.00');
  });

  it('hides the price when price_visible is false', () => {
    expect(listingPriceLabel({ ...base, price_visible: false })).toBe('Contact for price');
  });

  it('shows sold price only when the artist opted in', () => {
    expect(listingPriceLabel({ ...base, status: 'sold', show_sold_price: true, sold_price_cents: 25000 }))
      .toBe('Sold for $250.00');
  });

  it('never reveals a price on sold listings without opt-in — even if price was visible', () => {
    expect(listingPriceLabel({ ...base, status: 'sold', show_sold_price: false, sold_price_cents: 25000 }))
      .toBe('Sold');
    expect(listingPriceLabel({ ...base, status: 'sold' })).toBe('Sold');
  });

  it('sold + hidden price stays hidden regardless of flags order', () => {
    expect(listingPriceLabel({ ...base, status: 'sold', price_visible: false, show_sold_price: false }))
      .toBe('Sold');
  });
});
