import { describe, it, expect } from 'vitest';
import {
  isInquiryDispute,
  selectDisputeOpenAction,
  selectDisputeCloseOutcome,
  disputeReversalCents,
  restoredStatus,
  DisputeCloseOrder,
  DisputeOpenOrder,
} from './disputeOutcome';

const DISPUTE_ID = 'dp_test_1';

function openOrder(overrides: Partial<DisputeOpenOrder> = {}): DisputeOpenOrder {
  return { status: 'paid', stripe_refund_id: null, dispute_id: null, ...overrides };
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
    expect(selectDisputeOpenAction(openOrder({ status: 'refunded', dispute_id: DISPUTE_ID }), { id: DISPUTE_ID, status: 'needs_response' }))
      .toBe('already_recorded');
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
    const r = selectDisputeCloseOutcome(closeOrder({ status: 'shipped', shipped_at: '2026-08-05T00:00:00Z' }), { status: 'warning_closed', amount: 10000 });
    expect(r).toEqual({ kind: 'restored', status: 'shipped', outcome: null });
  });

  it('won after a settled refund restores to refunded, not paid', () => {
    const r = selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1', delivered_at: '2026-08-10T00:00:00Z' }),
      { status: 'won', amount: 10000 }
    );
    expect(r).toEqual({ kind: 'restored', status: 'refunded', outcome: 'won' });
  });

  it('won while in transit restores to shipped, not paid', () => {
    const r = selectDisputeCloseOutcome(
      closeOrder({ pre_dispute_status: 'shipped', shipped_at: '2026-08-05T00:00:00Z' }),
      { status: 'won', amount: 10000 }
    );
    expect(r).toEqual({ kind: 'restored', status: 'shipped', outcome: 'won' });
    // Same answer without the persisted column (orders disputed before 00050).
    expect(selectDisputeCloseOutcome(closeOrder({ shipped_at: '2026-08-05T00:00:00Z' }), { status: 'won', amount: 10000 }))
      .toEqual({ kind: 'restored', status: 'shipped', outcome: 'won' });
  });

  it('won on a delivered order restores to delivered', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ pre_dispute_status: 'delivered', delivered_at: '2026-08-10T00:00:00Z' }), { status: 'won', amount: 10000 }))
      .toEqual({ kind: 'restored', status: 'delivered', outcome: 'won' });
  });

  it('lost after a settled refund: no double reversal, outcome recorded', () => {
    const r = selectDisputeCloseOutcome(
      closeOrder({ status: 'refunded', stripe_refund_id: 're_1', stripe_reversal_id: 'trr_1', protection_status: 'pending' }),
      { status: 'lost', amount: 10000 }
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
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 8500 }), { status: 'lost', amount: 5000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 5000 });
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 8500 }), { status: 'lost', amount: 10330 }))
      .toMatchObject({ kind: 'lost', reverseCents: 8500 });
  });

  it('lost on a Protected order: platform absorbs, nothing reversed', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ protection_status: 'protected' }), { status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'lost', status: 'refunded', reverseCents: 0, platformAbsorbs: true, reversalAlreadyExists: false });
  });

  it('lost with a zero payout reverses nothing', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ artist_payout_cents: 0 }), { status: 'lost', amount: 10000 }))
      .toMatchObject({ kind: 'lost', reverseCents: 0 });
  });

  it('lost redelivery is a no-op', () => {
    expect(selectDisputeCloseOutcome(closeOrder({ status: 'refunded', dispute_outcome: 'lost', stripe_reversal_id: 'trr_1' }), { status: 'lost', amount: 10000 }))
      .toEqual({ kind: 'noop' });
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
