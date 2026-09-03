import { describe, it, expect } from 'vitest';
import {
  calculateRefundSplit,
  isFaultRefund,
  refundReasonLabel,
  REFUND_REASONS,
  type RefundSplitInput,
} from './refundSplit';

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
    // refundFee joined the shape in L6.
    expect(split).toEqual({ taxedBase: 0, feeTax: 0, refundTax: 0, refundFee: 0, refundAmount: 0 });
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

/**
 * L6 — the fault split. Terms of Sale §2, Artist Agreement §8 and the
 * Shipping policy all say the service fee is kept only on a discretionary
 * change-of-mind return; when the piece was never shipped, was lost, arrived
 * damaged, was materially not as described, or the error was ours, the buyer
 * gets the WHOLE charge back. The code retained the fee on every refund.
 */
describe('calculateRefundSplit — fault refunds return the whole charge (L6)', () => {
  // The plan's worked example: $200 piece + $20 shipping + $7 fee + tax.
  const order: RefundSplitInput = {
    amount_cents: 20_000,
    shipping_cents: 2_000,
    buyer_fee_cents: 700,
    amount_tax_cents: 1_872, // 8.25% of $227.00
  };

  it('returns every cent the buyer paid on a fault refund', () => {
    const split = calculateRefundSplit(order, 'damaged');
    expect(split.refundAmount).toBe(buyerTotal(order));
    expect(split.refundFee).toBe(order.buyer_fee_cents);
    expect(split.refundTax).toBe(order.amount_tax_cents);
    // Nothing is retained at all.
    expect(buyerTotal(order) - split.refundAmount).toBe(0);
  });

  it.each([
    'not_shipped',
    'lost_in_transit',
    'damaged',
    'not_as_described',
    'platform_error',
    'artist_cancelled',
  ] as const)('%s returns the full charge', (reason) => {
    expect(calculateRefundSplit(order, reason).refundAmount).toBe(buyerTotal(order));
  });

  it('change of mind still keeps the fee and its tax', () => {
    const split = calculateRefundSplit(order, 'change_of_mind');
    expect(split.refundFee).toBe(0);
    expect(buyerTotal(order) - split.refundAmount).toBe(order.buyer_fee_cents + split.feeTax);
    expect(split.refundAmount).toBeLessThan(buyerTotal(order));
  });

  it('defaults to the change-of-mind split, which is the pre-L6 behaviour', () => {
    expect(calculateRefundSplit(order)).toEqual(calculateRefundSplit(order, 'change_of_mind'));
  });

  it('a fault refund always returns strictly more than a change-of-mind one', () => {
    // The whole point of the ruling: the buyer is never worse off for a
    // problem that was not theirs.
    const fault = calculateRefundSplit(order, 'not_shipped').refundAmount;
    const mind = calculateRefundSplit(order, 'change_of_mind').refundAmount;
    expect(fault - mind).toBe(order.buyer_fee_cents + calculateRefundSplit(order).feeTax);
  });

  it('handles a zero-tax order without inventing a refund', () => {
    const noTax: RefundSplitInput = { amount_cents: 5_000, shipping_cents: 0, buyer_fee_cents: 175, amount_tax_cents: 0 };
    expect(calculateRefundSplit(noTax, 'not_shipped').refundAmount).toBe(5_175);
    expect(calculateRefundSplit(noTax, 'change_of_mind').refundAmount).toBe(5_000);
  });
});

describe('isFaultRefund / refundReasonLabel', () => {
  it('treats every reason but change of mind as fault', () => {
    expect(isFaultRefund('change_of_mind')).toBe(false);
    for (const r of REFUND_REASONS.filter((x) => x !== 'change_of_mind')) {
      expect(isFaultRefund(r)).toBe(true);
    }
  });

  it('does not treat a missing reason as fault', () => {
    // Orders settled before L6 carry no reason; they were priced as change of
    // mind, and must not be read as full refunds after the fact.
    expect(isFaultRefund(null)).toBe(false);
    expect(isFaultRefund(undefined)).toBe(false);
  });

  it('tells the buyer whether the fee was kept', () => {
    expect(refundReasonLabel('change_of_mind')).toMatch(/service fee retained/i);
    expect(refundReasonLabel('not_shipped')).toMatch(/in full/i);
    expect(refundReasonLabel(null)).toBe('Refunded');
  });
});
