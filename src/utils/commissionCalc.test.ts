import { describe, it, expect } from 'vitest';
import {
  calcSplit,
  calcBuyerFee,
  PLATFORM_RATE,
  BUYER_FEE_RATE,
  BUYER_FEE_CAP_CENTS,
} from './commissionCalc';

describe('calcBuyerFee', () => {
  it('charges 5% below the cap', () => {
    expect(calcBuyerFee(5000)).toBe(250); // $50 → $2.50
    expect(calcBuyerFee(15000)).toBe(750); // $150 → $7.50
  });

  it('hits the cap exactly at $300', () => {
    expect(calcBuyerFee(30000)).toBe(1500);
  });

  it('caps at $15 above $300', () => {
    expect(calcBuyerFee(30001)).toBe(1500);
    expect(calcBuyerFee(80000)).toBe(1500);
    expect(calcBuyerFee(500000)).toBe(1500);
  });

  it('rounds half-cents like the commission does', () => {
    // 99 * 0.05 = 4.95 → 5
    expect(calcBuyerFee(99)).toBe(5);
    // 30 * 0.05 = 1.5 → 2
    expect(calcBuyerFee(30)).toBe(2);
  });
});

describe('calcSplit', () => {
  it('handles the canonical example: $300 + $20 shipping', () => {
    const split = calcSplit(30000, 2000);
    expect(split.buyerTotal).toBe(33500); // buyer pays $335
    expect(split.artistPayout).toBe(27500); // artist gets $275
    expect(split.platformRevenue).toBe(6000); // platform gets $60
    expect(split.platformCommission).toBe(4500); // 15% of $300
    expect(split.buyerFee).toBe(1500); // 5% of $300, at the cap
    expect(split.shippingCents).toBe(2000);
  });

  it('is no longer regressive on low-price work: $50 print', () => {
    const split = calcSplit(5000);
    expect(split.buyerFee).toBe(250); // $2.50, not $10
    expect(split.buyerTotal).toBe(5250);
    expect(split.artistPayout).toBe(4250);
    expect(split.platformRevenue).toBe(1000);
  });

  it('handles a normal sale with no shipping argument (defaults to 0)', () => {
    const split = calcSplit(30000);
    expect(split.buyerTotal).toBe(31500);
    expect(split.artistPayout).toBe(25500);
    expect(split.platformRevenue).toBe(6000);
    expect(split.shippingCents).toBe(0);
  });

  it('handles explicit zero shipping (local pickup)', () => {
    const split = calcSplit(15000, 0);
    expect(split.buyerFee).toBe(750);
    expect(split.buyerTotal).toBe(15750);
    expect(split.artistPayout).toBe(12750);
    expect(split.platformRevenue).toBe(3000);
  });

  it('caps the fee on high-price work: $5,000 piece', () => {
    const split = calcSplit(500000, 5000);
    expect(split.buyerFee).toBe(1500);
    expect(split.buyerTotal).toBe(506500);
    expect(split.artistPayout).toBe(430000); // 85% + shipping
    expect(split.platformRevenue).toBe(76500);
  });

  it('rounds commission and fee on $0.99 correctly', () => {
    const split = calcSplit(99);
    // 99 * 0.15 = 14.85 → rounds to 15
    expect(split.platformCommission).toBe(15);
    // 99 * 0.05 = 4.95 → rounds to 5
    expect(split.buyerFee).toBe(5);
    expect(split.artistPayout).toBe(84);
    expect(split.buyerTotal).toBe(104);
    // money conservation: artist + platform = buyer total
    expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
  });

  it('rounds commission on $333.33 correctly', () => {
    const split = calcSplit(33333, 1500);
    // 33333 * 0.15 = 4999.95 → rounds to 5000
    expect(split.platformCommission).toBe(5000);
    expect(split.artistPayout).toBe(33333 - 5000 + 1500);
    expect(split.buyerTotal).toBe(33333 + 1500 + 1500); // fee capped
    expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
  });

  it('conserves money across many odd amounts, straddling the fee cap', () => {
    for (const price of [1, 101, 333, 999, 12345, 29999, 30000, 30001, 99999, 1000001]) {
      for (const ship of [0, 1, 750, 2999]) {
        const split = calcSplit(price, ship);
        expect(split.artistPayout + split.platformRevenue).toBe(split.buyerTotal);
        expect(split.buyerFee).toBeLessThanOrEqual(BUYER_FEE_CAP_CENTS);
        expect(Number.isInteger(split.platformCommission)).toBe(true);
        expect(Number.isInteger(split.buyerFee)).toBe(true);
        expect(Number.isInteger(split.artistPayout)).toBe(true);
        expect(Number.isInteger(split.buyerTotal)).toBe(true);
      }
    }
  });

  it('exports the contracted constants', () => {
    expect(PLATFORM_RATE).toBe(0.15);
    expect(BUYER_FEE_RATE).toBe(0.05);
    expect(BUYER_FEE_CAP_CENTS).toBe(1500);
  });
});
