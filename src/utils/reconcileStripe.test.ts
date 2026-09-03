import { describe, it, expect } from 'vitest';
import { diffPaymentAgainstOrder, reconcileTargets, paymentIntentIdOf, ReconcileCharge, ReconcileOrder } from './reconcileStripe';

const pi = { id: 'pi_1', amount: 12000 };

function charge(over: Partial<ReconcileCharge> = {}): ReconcileCharge {
  return {
    id: 'ch_1',
    amount: 12000,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    dispute: null,
    ...over,
  };
}

function order(over: Partial<ReconcileOrder> = {}): ReconcileOrder {
  return {
    id: 'ord_1',
    status: 'paid',
    stripe_refund_id: null,
    stripe_reversal_id: null,
    dispute_id: null,
    dispute_status: null,
    dispute_outcome: null,
    ...over,
  };
}

const kinds = (m: ReturnType<typeof diffPaymentAgainstOrder>) => m.map((x) => x.kind);

describe('diffPaymentAgainstOrder — clean cases', () => {
  it('healthy paid order', () => {
    expect(diffPaymentAgainstOrder(pi, charge(), order())).toEqual([]);
  });

  it('shipped / delivered orders are just as healthy', () => {
    expect(diffPaymentAgainstOrder(pi, charge(), order({ status: 'shipped' }))).toEqual([]);
    expect(diffPaymentAgainstOrder(pi, charge(), order({ status: 'delivered' }))).toEqual([]);
  });

  it("platform's own partial refund with the order refunded", () => {
    // Settle-refund returns price + shipping + their tax, never the fee, so
    // amount_refunded < amount and Stripe's `refunded` flag stays false.
    const c = charge({ amount_refunded: 11000, refunded: false });
    const o = order({ status: 'refunded', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1' });
    expect(diffPaymentAgainstOrder(pi, c, o)).toEqual([]);
  });

  it('oversell audit row: full refund on Stripe, refunded row', () => {
    const c = charge({ amount_refunded: 12000, refunded: true });
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'refunded' }))).toEqual([]);
  });

  it('lost dispute: no refund on the charge, order refunded with outcome lost', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'lost' } });
    const o = order({ status: 'refunded', dispute_id: 'dp_1', dispute_outcome: 'lost', stripe_reversal_id: 'trr_1' });
    expect(diffPaymentAgainstOrder(pi, c, o)).toEqual([]);
  });

  it('lost dispute with the dispute not expanded (id only) still reads the outcome from the row', () => {
    const c = charge({ disputed: true, dispute: 'dp_1' });
    const o = order({ status: 'refunded', dispute_id: 'dp_1', dispute_outcome: 'lost' });
    expect(diffPaymentAgainstOrder(pi, c, o)).toEqual([]);
  });

  it('open dispute recorded on the order', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'needs_response' } });
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'disputed', dispute_id: 'dp_1' }))).toEqual([]);
  });

  it('won dispute: charge stays disputed on Stripe, order restored', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'won' } });
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'delivered', dispute_outcome: 'won' }))).toEqual([]);
  });

  it('open inquiry (warning_*) never constrains the row either way', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'warning_needs_response' } });
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'paid', dispute_id: 'dp_1' }))).toEqual([]);
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'disputed', dispute_id: 'dp_1' }))).toEqual([]);
  });

  it('chargeback filed after a settled refund leaves the refunded row alone', () => {
    const c = charge({ amount_refunded: 11000, disputed: true, dispute: { id: 'dp_1', status: 'under_review' } });
    const o = order({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: 'dp_1', dispute_status: 'needs_response' });
    expect(diffPaymentAgainstOrder(pi, c, o)).toEqual([]);
    // Recorded at the same open status.
    expect(diffPaymentAgainstOrder(pi, c, order({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: 'dp_1', dispute_status: 'under_review' }))).toEqual([]);
  });
});

describe('diffPaymentAgainstOrder — mismatches', () => {
  it('payment with no row at all', () => {
    const m = diffPaymentAgainstOrder(pi, charge(), null);
    expect(kinds(m)).toEqual(['no_order']);
    expect(m[0].paymentIntentId).toBe('pi_1');
    expect(m[0].orderId).toBeNull();
  });

  it('no row and no charge object still reports', () => {
    expect(kinds(diffPaymentAgainstOrder(pi, null, null))).toEqual(['no_order']);
  });

  it('Stripe full refund, order still paid (dropped charge.refunded)', () => {
    const c = charge({ amount_refunded: 12000, refunded: true });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order()))).toEqual(['stripe_refunded_order_not_refunded']);
  });

  it('Stripe partial refund, order still paid (settle crashed after the refund)', () => {
    const c = charge({ amount_refunded: 11000 });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order({ status: 'shipped' })))).toEqual(['stripe_refunded_order_not_refunded']);
  });

  it('order refunded but Stripe never refunded and no dispute was lost', () => {
    expect(kinds(diffPaymentAgainstOrder(pi, charge(), order({ status: 'refunded' })))).toEqual([
      'order_refunded_stripe_not_refunded',
    ]);
  });

  it('open dispute on Stripe, order still paid (dropped charge.dispute.created)', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'needs_response' } });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order()))).toEqual(['stripe_disputed_order_not_disputed']);
  });

  it('disputed charge with the dispute unexpanded and a row that records no dispute', () => {
    const c = charge({ disputed: true, dispute: 'dp_1' });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order()))).toEqual(['stripe_disputed_order_not_disputed']);
  });

  it('dispute lost on Stripe, order not refunded (dropped charge.dispute.closed)', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'lost' } });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order({ status: 'disputed', dispute_id: 'dp_1' })))).toEqual([
      'dispute_lost_order_not_refunded',
    ]);
  });

  it('dispute won on Stripe, order stuck in disputed', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'won' } });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order({ status: 'disputed', dispute_id: 'dp_1' })))).toEqual([
      'dispute_closed_order_still_disputed',
    ]);
  });

  it('inquiry closed on Stripe, order stuck in disputed', () => {
    const c = charge({ disputed: true, dispute: { id: 'dp_1', status: 'warning_closed' } });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order({ status: 'disputed', dispute_id: 'dp_1' })))).toEqual([
      'dispute_closed_order_still_disputed',
    ]);
  });

  it('an inquiry that escalated after the platform refund, still recorded as an inquiry (04-r3 P1)', () => {
    // Settle-refund (partial), inquiry recorded, escalation dropped.
    const c = charge({ amount_refunded: 11000, disputed: true, dispute: { id: 'dp_1', status: 'needs_response' } });
    const o = order({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: 'dp_1', dispute_status: 'warning_needs_response' });
    expect(kinds(diffPaymentAgainstOrder(pi, c, o))).toEqual(['dispute_escalated_on_refunded_order']);
    // A dashboard full refund reconciled by charge.refunded: same answer.
    const full = charge({ amount_refunded: 12000, refunded: true, disputed: true, dispute: { id: 'dp_1', status: 'under_review' } });
    expect(kinds(diffPaymentAgainstOrder(pi, full, order({ status: 'refunded', dispute_id: 'dp_1', dispute_status: 'warning_under_review' }))))
      .toEqual(['dispute_escalated_on_refunded_order']);
    // A refunded row that never recorded the dispute at all.
    expect(kinds(diffPaymentAgainstOrder(pi, c, order({ status: 'refunded', stripe_refund_id: 're_1' }))))
      .toEqual(['dispute_escalated_on_refunded_order']);
  });

  it('reports both directions at once when both are wrong', () => {
    // Refunded in full on Stripe AND an open dispute, while the row says paid.
    const c = charge({ amount_refunded: 12000, refunded: true, disputed: true, dispute: { id: 'dp_1', status: 'needs_response' } });
    expect(kinds(diffPaymentAgainstOrder(pi, c, order())).sort()).toEqual(
      ['stripe_disputed_order_not_disputed', 'stripe_refunded_order_not_refunded'].sort()
    );
  });
});

describe('reconcileTargets — the union the cron diffs', () => {
  it('window ids come first, extras are appended once each, and only the extras need retrieving', () => {
    const t = reconcileTargets(['pi_a', 'pi_b'], ['pi_c', 'pi_a', 'pi_d', 'pi_c']);
    expect(t.all).toEqual(['pi_a', 'pi_b', 'pi_c', 'pi_d']);
    expect(t.retrieve).toEqual(['pi_c', 'pi_d']);
    expect(Array.from(t.windowIds)).toEqual(['pi_a', 'pi_b']);
  });

  it('skips null / undefined / empty ids (a refund on a bare charge, a disputed row with no payment intent)', () => {
    const t = reconcileTargets(['pi_a', ''], [null, undefined, '', 'pi_b']);
    expect(t.all).toEqual(['pi_a', 'pi_b']);
    expect(t.retrieve).toEqual(['pi_b']);
  });

  it('an old disputed order months outside the window is retrieved', () => {
    // The whole point: a dispute decided 10 weeks after payment.
    const t = reconcileTargets([], ['pi_old_disputed']);
    expect(t.retrieve).toEqual(['pi_old_disputed']);
    expect(t.windowIds.has('pi_old_disputed')).toBe(false);
  });

  it('empty in, empty out', () => {
    expect(reconcileTargets([], [])).toEqual({ all: [], retrieve: [], windowIds: new Set() });
  });
});

describe('paymentIntentIdOf', () => {
  it('reads a string id, an expanded object, or nothing', () => {
    expect(paymentIntentIdOf({ payment_intent: 'pi_1' })).toBe('pi_1');
    expect(paymentIntentIdOf({ payment_intent: { id: 'pi_2' } })).toBe('pi_2');
    expect(paymentIntentIdOf({ payment_intent: null })).toBeNull();
  });
});
