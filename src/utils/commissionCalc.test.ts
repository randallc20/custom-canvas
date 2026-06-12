import { describe, it, expect } from 'vitest';
import { calcSplit, PLATFORM_RATE, BUYER_FEE_CENTS } from './commissionCalc';

describe('calcSplit', () => {
  it('handles the canonical example: $300 + $20 shipping', () => {
    const split = calcSplit(30000, 2000);
    expect(split.buyerTotal).toBe(33000); // buyer pays $330
    expect(split.artistPayout).toBe(27500); // artist gets $275
    expect(split.platformRevenue).toBe(5500); // platform gets $55
    expect(split.platformCommission).toBe(4500); // 15% of $300
    expect(split.buyerFee).toBe(1000);
    expect(split.shippingCents).toBe(2000);
  });

  it('handles a normal sale with no shipping argument (defaults to 0)', () => {
    const split = calcSplit(30000);
    expect(split.buyerTotal).toBe(31000);
    expect(split.artistPayout).toBe(25500);
    expect(split.platformRevenue).toBe(5500);
    expect(split.shippingCents).toBe(0);
  });

  it('handles explicit zero shipping (local pickup)', () => {
    const split = calcSplit(15000, 0);
    expect(split.buyerTotal).toBe(16000);
    expect(split.artistPayout).toBe(12750);
    expect(split.platformRevenue).toBe(3250);
  });

  it('rounds commission on $0.99 correctly', () => {
    const split = calcSplit(99);
    // 99 * 0.15 = 14.85 → rounds to 15
    expect(split.platformCommission).toBe(15);
    expect(split.artistPayout).toBe(84);
    expect(split.buyerTotal).toBe(1099);
    // money conservation: artist + platform = buyer total
    expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
  });

  it('rounds commission on $333.33 correctly', () => {
    const split = calcSplit(33333, 1500);
    // 33333 * 0.15 = 4999.95 → rounds to 5000
    expect(split.platformCommission).toBe(5000);
    expect(split.artistPayout).toBe(33333 - 5000 + 1500);
    expect(split.buyerTotal).toBe(33333 + 1000 + 1500);
    expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
  });

  it('conserves money across many odd amounts', () => {
    for (const price of [101, 333, 999, 12345, 99999, 1000001]) {
      for (const ship of [0, 1, 750, 2999]) {
        const split = calcSplit(price, ship);
        expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
        expect(Number.isInteger(split.platformCommission)).toBe(true);
        expect(Number.isInteger(split.artistPayout)).toBe(true);
        expect(Number.isInteger(split.buyerTotal)).toBe(true);
      }
    }
  });

  it('exports the contracted constants', () => {
    expect(PLATFORM_RATE).toBe(0.15);
    expect(BUYER_FEE_CENTS).toBe(1000);
  });
});
