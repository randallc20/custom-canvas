import { describe, it, expect } from 'vitest';
import {
  calcSplit,
  calcBuyerFee,
  PLATFORM_RATE,
  STRIPE_PERCENT,
  STRIPE_FIXED_CENTS,
} from './commissionCalc';

/** What Stripe actually charges on a captured total. */
function actualStripeFee(totalCents: number): number {
  return Math.round(STRIPE_PERCENT * totalCents) + STRIPE_FIXED_CENTS;
}

describe('calcBuyerFee', () => {
  it('covers the Stripe fee exactly on a typical order', () => {
    // $300 + $20 shipping
    expect(calcBuyerFee(30000, 2000)).toBe(987); // $9.87
  });

  it('covers the Stripe fee exactly on a high-value piece', () => {
    expect(calcBuyerFee(100000)).toBe(3018); // $30.18 on $1,000
  });

  it('scales with price rather than capping', () => {
    expect(calcBuyerFee(500000)).toBeGreaterThan(calcBuyerFee(100000));
  });

  it('includes shipping in the base, since Stripe charges on it', () => {
    expect(calcBuyerFee(30000, 2000)).toBeGreaterThan(calcBuyerFee(30000, 0));
  });

  it('never leaves the platform short, across the price range', () => {
    for (const price of [99, 2500, 30000, 75000, 100000, 250000, 500000]) {
      for (const ship of [0, 1500, 5000]) {
        const fee = calcBuyerFee(price, ship);
        const total = price + ship + fee;
        expect(fee).toBeGreaterThanOrEqual(actualStripeFee(total));
        // ...and never gouges: at most a cent of slack.
        expect(fee - actualStripeFee(total)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('calcSplit', () => {
  it('splits a $300 piece with $20 shipping', () => {
    const split = calcSplit(30000, 2000);
    expect(split.platformCommission).toBe(4500); // 15% of $300
    expect(split.artistPayout).toBe(27500); // $300 - $45 + $20 shipping
    expect(split.buyerFee).toBe(987);
    expect(split.buyerTotal).toBe(32987); // $329.87
    expect(split.platformRevenue).toBe(4500); // commission only
  });

  it('passes shipping through to the artist untouched', () => {
    const withShip = calcSplit(30000, 2000);
    const without = calcSplit(30000, 0);
    expect(withShip.artistPayout - without.artistPayout).toBe(2000);
  });

  it('takes commission on the artwork price only, not shipping', () => {
    const split = calcSplit(30000, 5000);
    expect(split.platformCommission).toBe(Math.round(30000 * PLATFORM_RATE));
  });

  it('leaves the platform its full commission after Stripe takes its cut', () => {
    const split = calcSplit(100000);
    const net = split.buyerTotal - split.artistPayout - actualStripeFee(split.buyerTotal);
    expect(net).toBeGreaterThanOrEqual(split.platformCommission);
  });

  it('balances: buyer total covers artist, commission, and Stripe', () => {
    for (const price of [5000, 30000, 100000, 500000]) {
      for (const ship of [0, 2000]) {
        const s = calcSplit(price, ship);
        expect(s.buyerTotal).toBe(price + ship + s.buyerFee);
        expect(s.artistPayout + s.platformCommission).toBe(price + ship);
      }
    }
  });
});
