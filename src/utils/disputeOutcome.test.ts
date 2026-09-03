import { describe, it, expect } from 'vitest';
import {
  isInquiryDispute,
  isClosedDisputeStatus,
  selectDisputeOpenAction,
  selectDisputeCloseOutcome,
  disputeReversalCents,
  restoredStatus,
  DisputeCloseOrder,
  DisputeOpenOrder,
} from './disputeOutcome';

const DISPUTE_ID = 'dp_test_1';

function openOrder(overrides: Partial<DisputeOpenOrder> = {}): DisputeOpenOrder {
  return { status: 'paid', stripe_refund_id: null, dispute_id: null, dispute_status: null, dispute_outcome: null, ...overrides };
}

function closeOrder(overrides: Partial<DisputeCloseOrder> = {}): DisputeCloseOrder {
  return {
    status: 'disputed',
    pre_dispute_status: null,
    stripe_refund_id: null,
    stripe_reversal_id: null,
    shipped_at: null,
    delivered_at: null,
    artist_payout_cents: 8500,
    protection_status: 'ineligible',
    dispute_id: DISPUTE_ID,
    dispute_outcome: null,
    ...overrides,
  };
}

describe('isInquiryDispute', () => {
  it('recognises every warning_* status as an inquiry', () => {
    expect(isInquiryDispute('warning_needs_response')).toBe(true);
    expect(isInquiryDispute('warning_under_review')).toBe(true);
    expect(isInquiryDispute('warning_closed')).toBe(true);
    expect(isInquiryDispute('needs_response')).toBe(false);
    expect(isInquiryDispute('lost')).toBe(false);
    expect(isInquiryDispute('won')).toBe(false);
  });
});

describe('selectDisputeOpenAction', () => {
  it('inquiry created: records without changing status or assessing protection', () => {
    expect(selectDisputeOpenAction(openOrder(), { id: DISPUTE_ID, status: 'warning_needs_response' }))
      .toBe('inquiry');
    // Even on a shipped/delivered order — no funds moved, nothing to freeze.
    expect(selectDisputeOpenAction(openOrder({ status: 'delivered' }), { id: DISPUTE_ID, status: 'warning_needs_response' }))
      .toBe('inquiry');
  });

  it('inquiry redelivery is a no-op', () => {
    expect(selectDisputeOpenAction(openOrder({ dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status: 'warning_needs_response' }))
      .toBe('already_recorded');
  });

  it('a chargeback after a settled refund leaves the refunded status alone', () => {
    expect(selectDisputeOpenAction(openOrder({ status: 'refunded', stripe_refund_id: 're_1' }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('post_refund');
    // A dashboard refund the webhook reconciled has no refund id on the row.
    expect(selectDisputeOpenAction(openOrder({ status: 'refunded' }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('post_refund');
    // Or the admin route persisted the refund id but the status write is pending.
    expect(selectDisputeOpenAction(openOrder({ status: 'paid', stripe_refund_id: 're_1' }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('post_refund');
    // A true redelivery: same id, recorded with the same open status.
    expect(selectDisputeOpenAction(openOrder({ status: 'refunded', dispute_id: DISPUTE_ID, dispute_status: 'needs_response' }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('already_recorded');
  });

  it('an inquiry that escalates after the platform refunded the payment is a new chargeback, not a redelivery (04-r3 P1)', () => {
    // The inquiry branch recorded the id with its warning_* status; the admin
    // settled the refund to make it go away; the issuer escalated anyway.
    for (const recorded of ['warning_needs_response', 'warning_under_review']) {
      expect(selectDisputeOpenAction(
        openOrder({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: DISPUTE_ID, dispute_status: recorded }),
        { id: DISPUTE_ID, status: 'needs_response' }
      )).toBe('post_refund_escalated');
      expect(selectDisputeOpenAction(
        openOrder({ status: 'refunded', dispute_id: DISPUTE_ID, dispute_status: recorded }),
        { id: DISPUTE_ID, status: 'under_review' }
      )).toBe('post_refund_escalated');
    }
    // A row recorded before 00057 has no status: nothing says the id was a
    // chargeback, so treat the escalation as new — a duplicate ping is cheap.
    expect(selectDisputeOpenAction(
      openOrder({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: DISPUTE_ID, dispute_status: null }),
      { id: DISPUTE_ID, status: 'needs_response' }
    )).toBe('post_refund_escalated');
  });

  it('a post-refund chargeback whose open status moved on is notified again, never swallowed (04-r3 P1)', () => {
    expect(selectDisputeOpenAction(
      openOrder({ status: 'refunded', stripe_refund_id: 're_1', dispute_id: DISPUTE_ID, dispute_status: 'needs_response' }),
      { id: DISPUTE_ID, status: 'under_review' }
    )).toBe('post_refund');
  });

  it('an inquiry escalating on a live order still freezes it, whatever was recorded', () => {
    expect(selectDisputeOpenAction(
      openOrder({ status: 'shipped', dispute_id: DISPUTE_ID, dispute_status: 'warning_needs_response' }),
      { id: DISPUTE_ID, status: 'needs_response' }
    )).toBe('chargeback');
  });

  it('a resent open event for a dispute this row already closed never re-freezes it (04-r3 P3)', () => {
    // A won chargeback: the order is back to shipped, dispute_id kept,
    // dispute_outcome 'won'. The resent `created` still says needs_response.
    expect(selectDisputeOpenAction(
      openOrder({ status: 'shipped', dispute_id: DISPUTE_ID, dispute_status: 'won', dispute_outcome: 'won' }),
      { id: DISPUTE_ID, status: 'needs_response' }
    )).toBe('already_recorded');
    expect(selectDisputeOpenAction(
      openOrder({ status: 'delivered', dispute_id: DISPUTE_ID, dispute_status: 'won', dispute_outcome: 'won' }),
      { id: DISPUTE_ID, status: 'under_review' }
    )).toBe('already_recorded');
    // After a loss too (the id survives a lost close).
    expect(selectDisputeOpenAction(
      openOrder({ status: 'refunded', dispute_id: DISPUTE_ID, dispute_status: 'lost', dispute_outcome: 'lost' }),
      { id: DISPUTE_ID, status: 'needs_response' }
    )).toBe('already_recorded');
    // A DIFFERENT dispute on the same restored order is real.
    expect(selectDisputeOpenAction(
      openOrder({ status: 'shipped', dispute_id: DISPUTE_ID, dispute_status: 'won', dispute_outcome: 'won' }),
      { id: 'dp_test_2', status: 'needs_response' }
    )).toBe('chargeback');
  });

  it('a real chargeback on a live order freezes it', () => {
    for (const status of ['paid', 'shipped', 'delivered']) {
      expect(selectDisputeOpenAction(openOrder({ status }), { id: DISPUTE_ID, status: 'needs_response' }))
        .toBe('chargeback');
    }
  });

  it('an escalated inquiry (same dispute id, now needs_response) still freezes the order', () => {
    expect(selectDisputeOpenAction(openOrder({ status: 'shipped', dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('chargeback');
  });

  it('a chargeback redelivery on an already-disputed order is a no-op', () => {
    expect(selectDisputeOpenAction(openOrder({ status: 'disputed', dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('already_recorded');
  });

  it('a late or resent open event for a dispute that is already over never re-freezes (won/lost/warning_closed/charge_refunded)', () => {
    for (const status of ['won', 'lost', 'warning_closed', 'charge_refunded']) {
      expect(isClosedDisputeStatus(status)).toBe(true);
      // After a won restore: back to shipped, dispute_id kept (R13 keeps it).
      expect(selectDisputeOpenAction(openOrder({ status: 'shipped', dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status }))
        .toBe('already_recorded');
      // Even without the id on the row (orders restored before R13 nulled it).
      expect(selectDisputeOpenAction(openOrder({ status: 'shipped' }), { id: DISPUTE_ID, status }))
        .toBe('already_recorded');
      // After a lost close.
      expect(selectDisputeOpenAction(openOrder({ status: 'refunded', dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status }))
        .toBe('already_recorded');
      // A live order that was never frozen (closed outran created entirely).
      expect(selectDisputeOpenAction(openOrder({ status: 'paid' }), { id: DISPUTE_ID, status }))
        .toBe('already_recorded');
    }
    expect(isClosedDisputeStatus('needs_response')).toBe(false);
    expect(isClosedDisputeStatus('warning_needs_response')).toBe(false);
  });
});

describe('restoredStatus', () => {
  it('prefers the status saved at dispute time', () => {
    expect(restoredStatus(closeOrder({ pre_dispute_status: 'shipped', delivered_at: '2026-08-10T00:00:00Z' }))).toBe('shipped');
    expect(restoredStatus(closeOrder({ pre_dispute_status: 'delivered' }))).toBe('delivered');
  });

  it('falls back to refunded when the money already went back', () => {
    expect(restoredStatus(closeOrder({ stripe_refund_id: 're_1', delivered_at: '2026-08-10T00:00:00Z' }))).toBe('refunded');
    expect(restoredStatus(closeOrder({ status: 'refunded' }))).toBe('refunded');
  });

  it('a refund settled while the order was frozen outranks the status saved at freeze time', () => {
    // The created handler always writes pre_dispute_status; the admin settled
    // the approved refund between the ruling and this event's delivery.
    expect(restoredStatus(closeOrder({ pre_dispute_status: 'paid', stripe_refund_id: 're_1' }))).toBe('refunded');
    expect(restoredStatus(closeOrder({ pre_dispute_status: 'shipped', status: 'refunded' }))).toBe('refunded');
  });

  it('falls back to shipped for a piece still in transit', () => {
    expect(restoredStatus(closeOrder({ shipped_at: '2026-08-05T00:00:00Z' }))).toBe('shipped');
  });

  it('falls back to the old delivered/paid rule last', () => {
    expect(restoredStatus(closeOrder({ shipped_at: '2026-08-05T00:00:00Z', delivered_at: '2026-08-10T00:00:00Z' }))).toBe('delivered');
    expect(restoredStatus(closeOrder())).toBe('paid');
  });
});

describe('selectDisputeCloseOutcome', () => {
  it('inquiry closed (warning_closed) restores the order with no outcome recorded', () => {
    // An inquiry never changed status, so the row still reads as it was.
    const r = selectDisputeCloseOutcome(closeOrder({ status: 'shipped', shipped_at: '2026-08-05T00:00:00Z' }), { id: DISPUTE_ID, status: 'warning_closed', amount: 10000 });
    expect(r).toEqual({ kind: 'restored', status: 'shipped', outcome: null });
  });

  it('won after a settled refund restores to refunded, not paid', () => {
    // Previously passed only because pre_dispute_status was null here; the
    // created handler always writes it, so the real row carries 'paid'.
    const r = selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', pre_dispute_status: 'paid', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1', delivered_at: '2026-08-10T00:00:00Z' }),
      { id: DISPUTE_ID, status: 'won', amount: 10000 }
    );
    expect(r).toEqual({ kind: 'restored', status: 'refunded', outcome: 'won' });
    // Settled mid-dispute: the row is still 'disputed' with the refund id on it.
    expect(selectDisputeCloseOutcome(
      closeOrder({ status: 'disputed', pre_dispute_status: 'paid', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1' }),
      { id: DISPUTE_ID, status: 'won', amount: 10000 }
    )).toEqual({ kind: 'restored', status: 'refunded', outcome: 'won' });
  });

  it('won while in transit restores to shipped, not paid', () => {
    const r = selectDisputeCloseOutcome(
      closeOrder({ pre_dispute_status: 'shipped', shipped_at: '2026-08-05T00:00:00Z' }),
      { id: DISPUTE_ID, status: 'won', amount: 10000 }
    );
    expect(r).toEqual({ kind: 'restored', status: 'shipped', outcome: 'won' });
    // Same answer without the persisted column (orders disputed before 00050).
    expect(selectDisputeCloseOutcome(closeOrder({ shipped_at: '2026-08-05T00:00:00Z' }), { id: DISPUTE_ID, status: 'won', amount: 10000 }))
      .toEqual({ kind: 'restored', status: 'shipped', outcome: 'won' });
  });

  it('won on a delivered order restores to delivered', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ pre_dispute_status: 'delivered', delivered_at: '2026-08-10T00:00:00Z' }), { id: DISPUTE_ID, status: 'won', amount: 10000 }))
      .toEqual({ kind: 'restored', status: 'delivered', outcome: 'won' });
  });

  it('lost after a settled refund: no double reversal, outcome recorded', () => {
    const r = selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1', protection_status: 'pending' }),
      { id: DISPUTE_ID, status: 'lost', amount: 10000 }
    );
    expect(r).toEqual({
      kind: 'lost',
      status: 'refunded',
      reverseCents: 0,
      platformAbsorbs: false,
      reversalAlreadyExists: true,
    });
  });

  it('lost with a partial amount reverses the disputed amount, capped at the payout', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 8500 }), { id: DISPUTE_ID, status: 'lost', amount: 5000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 5000 });
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 8500 }), { id: DISPUTE_ID, status: 'lost', amount: 10330 }))
      .toMatchObject({ kind: 'lost', reverseCents: 8500 });
  });

  it('lost on a Protected order: platform absorbs, nothing reversed', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ protection_status: 'protected' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'lost', status: 'refunded', reverseCents: 0, platformAbsorbs: true, reversalAlreadyExists: false });
  });

  it('lost with a zero payout reverses nothing', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 0 }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 0 });
  });

  it('lost on an order whose protection was never assessed asks for the assessment instead of reversing', () => {
    // closed outran created: protection_status still at its 'pending' default.
    for (const status of ['paid', 'shipped', 'delivered']) {
      expect(selectDisputeCloseOutcome(closeOrder({ status, protection_status: 'pending' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
        .toEqual({ kind: 'needs_assessment' });
    }
    // Same when the freeze committed concurrently but left 'pending' on the row.
    expect(selectDisputeCloseOutcome(closeOrder({ status: 'disputed', protection_status: 'pending', pre_dispute_status: 'shipped' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'needs_assessment' });
  });

  it('after the assessment a protected order is absorbed by the platform', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ status: 'shipped', protection_status: 'protected' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'lost', status: 'refunded', reverseCents: 0, platformAbsorbs: true, reversalAlreadyExists: false });
  });

  it('after the assessment an ineligible order is reversed for the disputed amount', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ status: 'shipped', protection_status: 'ineligible' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'lost', status: 'refunded', reverseCents: 8500, platformAbsorbs: false, reversalAlreadyExists: false });
  });

  it('lost redelivery is a no-op', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ status: 'refunded', dispute_outcome: 'lost', stripe_reversal_id: 'trr_1' }), { id: DISPUTE_ID, status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'noop' });
  });

  it('the same dispute lost again is a no-op even with the transfer figure supplied', () => {
    expect(selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', dispute_outcome: 'lost', stripe_reversal_id: 'trr_1' }),
      { id: DISPUTE_ID, status: 'lost', amount: 10000, transferAmountReversed: 6000 }
    )).toEqual({ kind: 'noop' });
  });

  it('a second dispute lost after a partial first loss reverses the remainder of the payout (04-r3 P2)', () => {
    // $400 order, $340 payout. First dispute ($60, the frame) lost and
    // reversed $60. The buyer files a second dispute for the rest.
    const row = closeOrder({
      status: 'refunded',
      artist_payout_cents: 34000,
      dispute_id: DISPUTE_ID,
      dispute_outcome: 'lost',
      stripe_reversal_id: 'trr_first',
    });
    // Without the transfer figure the route learns money COULD move (the
    // first reversal is on the row, so the old answer would have been 0)…
    const first = selectDisputeCloseOutcome(row, { id: 'dp_test_2', status: 'lost', amount: 34000 });
    expect(first.kind).toBe('lost');
    // …and re-selects with what Stripe says is already reversed.
    expect(selectDisputeCloseOutcome(row, { id: 'dp_test_2', status: 'lost', amount: 34000, transferAmountReversed: 6000 }))
      .toEqual({ kind: 'lost', status: 'refunded', reverseCents: 28000, platformAbsorbs: false, reversalAlreadyExists: true });
    // A smaller second dispute reverses only its own amount.
    expect(selectDisputeCloseOutcome(row, { id: 'dp_test_2', status: 'lost', amount: 10000, transferAmountReversed: 6000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 10000 });
    // Nothing left: the first loss (or a settled refund) took the whole payout.
    expect(selectDisputeCloseOutcome(row, { id: 'dp_test_2', status: 'lost', amount: 34000, transferAmountReversed: 34000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 0, reversalAlreadyExists: true });
  });

  it('a second dispute on a Protected order is absorbed like the first', () => {
    expect(selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', protection_status: 'protected', dispute_id: DISPUTE_ID, dispute_outcome: 'lost' }),
      { id: 'dp_test_2', status: 'lost', amount: 5000, transferAmountReversed: 0 }
    )).toEqual({ kind: 'lost', status: 'refunded', reverseCents: 0, platformAbsorbs: true, reversalAlreadyExists: false });
  });

  it('with the transfer figure a settled refund that reversed everything still reverses nothing', () => {
    expect(selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1', dispute_id: null }),
      { id: DISPUTE_ID, status: 'lost', amount: 10000, transferAmountReversed: 8500 }
    )).toEqual({ kind: 'lost', status: 'refunded', reverseCents: 0, platformAbsorbs: false, reversalAlreadyExists: true });
  });
});

describe('disputeReversalCents', () => {
  it('never exceeds the payout and never goes negative', () => {
    expect(disputeReversalCents(5000, 8500)).toBe(5000);
    expect(disputeReversalCents(9000, 8500)).toBe(8500);
    expect(disputeReversalCents(-1, 8500)).toBe(0);
    expect(disputeReversalCents(5000, 0)).toBe(0);
  });
});
