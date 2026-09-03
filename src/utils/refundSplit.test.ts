import { describe, it, expect } from 'vitest';
import { calculateRefundSplit, type RefundSplitInput } from './refundSplit';

/**
 * The admin refund's tax proration, returned to real buyers, previously
 * pinned by nothing (05-P3 "tests", item 3).
 *
 * DECISIONS.md states the policy in words, not numbers — 2026-07-06
 * ("Artist-mediated refunds; service fee non-refundable": the buyer receives
 * price + shipping + the tax on those amounts; the fee and its tax are
 * retained), 2026-08-21 (the fee formula and `artist_payout + platform_fee +
 * buyer_fee = buyer total`), 2026-07-24 (platform is merchant of record, so
 * the tax is the platform's to return). The three worked examples below are
 * those three clauses turned into cents, using the fee formula from
 * DECISIONS.md 2026-08-21: fee = ceil((0.029 × (price + shipping) + 30) /
 * 0.971). The fourth is the partial-tax case, where the fee's share of the
 * tax rounds away entirely.
 */

const buyerFee = (baseCents: number) => Math.ceil((0.029 * baseCents + 30) / (1 - 0.029));
const buyerTotal = (o: RefundSplitInput) =>
  o.amount_cents + o.shipping_cents + o.buyer_fee_cents + o.amount_tax_cents;

describe('calculateRefundSplit — the DECISIONS.md policy in cents', () => {
  // Example 1 — the live-test-plan sale: $20 piece, $5 shipping, $1.06 fee,
  // Houston 8.25% on all three lines ($26.06 → $2.15 tax, $28.21 charged).
  it('refunds price + shipping + their tax, and keeps the fee and the fee tax', () => {
    const order: RefundSplitInput = {
      amount_cents: 2000,
      shipping_cents: 500,
      buyer_fee_cents: 106,
      amount_tax_cents: 215,
    };
    const split = calculateRefundSplit(order);
    expect(split.taxedBase).toBe(2606);
    expect(split.feeTax).toBe(9); // round(215 × 106 / 2606)
    expect(split.refundTax).toBe(206);
    expect(split.refundAmount).toBe(2706); // $27.06 back on a $28.21 charge
    // The platform keeps exactly the fee plus the tax charged on the fee.
    expect(buyerTotal(order) - split.refundAmount).toBe(order.buyer_fee_cents + split.feeTax);
  });

  // Example 2 — a $1,000 piece, local pickup (no shipping line), same rate.
  // The proportional share is big enough here to be visibly wrong if the
  // formula ever prorates against the wrong base.
  it('prorates against price + shipping + fee, not against price alone', () => {
    const order: RefundSplitInput = {
      amount_cents: 100_000,
      shipping_cents: 0,
      buyer_fee_cents: buyerFee(100_000),
      amount_tax_cents: 8499,
    };
    expect(order.buyer_fee_cents).toBe(3018);
    const split = calculateRefundSplit(order);
    expect(split.taxedBase).toBe(103_018);
    expect(split.feeTax).toBe(249);
    expect(split.refundTax).toBe(8250);
    expect(split.refundAmount).toBe(108_250);
    expect(buyerTotal(order) - split.refundAmount).toBe(order.buyer_fee_cents + split.feeTax);

    // Prorating against price alone would return 8499 − round(8499 × 3018 /
    // 100000) = 8243 in tax: 7¢ of the platform's remittance handed back.
    expect(split.refundTax).not.toBe(8499 - Math.round((8499 * 3018) / 100_000));
  });

  // Example 3 — a zero-tax order (the out-of-state billing address recorded
  // as the open D2 question: an Oregon billing ZIP on a pickup basket is
  // taxed $0). Nothing to prorate, and the fee is still retained.
  it('refunds price + shipping exactly when no tax was charged', () => {
    const order: RefundSplitInput = {
      amount_cents: 45_000,
      shipping_cents: 0,
      buyer_fee_cents: buyerFee(45_000),
      amount_tax_cents: 0,
    };
    expect(order.buyer_fee_cents).toBe(1375);
    const split = calculateRefundSplit(order);
    expect(split.feeTax).toBe(0);
    expect(split.refundTax).toBe(0);
    expect(split.refundAmount).toBe(45_000);
    expect(buyerTotal(order) - split.refundAmount).toBe(order.buyer_fee_cents);
  });

  // Partial tax — the fee's share is under half a cent, so the buyer gets
  // the whole (tiny) tax back and the platform keeps nothing of it. The
  // rounding must never leave the buyer short.
  it('rounds a sub-cent fee share to zero and returns the whole tax', () => {
    const order: RefundSplitInput = {
      amount_cents: 2000,
      shipping_cents: 500,
      buyer_fee_cents: 106,
      amount_tax_cents: 1,
    };
    const split = calculateRefundSplit(order);
    expect(split.feeTax).toBe(0);
    expect(split.refundTax).toBe(1);
    expect(split.refundAmount).toBe(2501);
  });
});

describe('calculateRefundSplit — edges that must not pay out more than was charged', () => {
  it('never returns a negative tax', () => {
    const split = calculateRefundSplit({
      amount_cents: 0,
      shipping_cents: 0,
      buyer_fee_cents: 500,
      amount_tax_cents: 41,
    });
    // Fee-only order: the whole tax is the fee's, so nothing is returned.
    expect(split.feeTax).toBe(41);
    expect(split.refundTax).toBe(0);
    expect(split.refundAmount).toBe(0);
  });

  it('does not divide by zero on an all-zero order', () => {
    const split = calculateRefundSplit({
      amount_cents: 0,
      shipping_cents: 0,
      buyer_fee_cents: 0,
      amount_tax_cents: 0,
    });
    expect(split).toEqual({ taxedBase: 0, feeTax: 0, refundTax: 0, refundAmount: 0 });
  });

  it('refunds no more than the buyer was charged, across a sweep of rates', () => {
    for (let price = 500; price <= 200_000; price += 3_137) {
      for (const shipping of [0, 500, 2500]) {
        const fee = buyerFee(price + shipping);
        for (const rate of [0, 0.0625, 0.0825, 0.095]) {
          const order: RefundSplitInput = {
            amount_cents: price,
            shipping_cents: shipping,
            buyer_fee_cents: fee,
            amount_tax_cents: Math.round((price + shipping + fee) * rate),
          };
          const split = calculateRefundSplit(order);
          expect(split.refundAmount).toBeLessThanOrEqual(buyerTotal(order));
          expect(split.refundTax).toBeGreaterThanOrEqual(0);
          expect(split.refundTax).toBeLessThanOrEqual(order.amount_tax_cents);
          // Whatever the buyer does not get back is the fee plus its tax.
          expect(buyerTotal(order) - split.refundAmount).toBe(fee + split.feeTax);
        }
      }
    }
  });
});
