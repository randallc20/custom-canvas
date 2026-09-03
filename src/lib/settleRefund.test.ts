import { beforeEach, describe, expect, it, vi } from 'vitest';

// settleRefund reaches for the service-role client's TYPE and for Stripe. The
// client itself is passed in, so only these two need standing in for.
vi.mock('@/lib/supabase-admin', () => ({ createAdminSupabaseClient: () => ({}) }));
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const stripeStub = {
  refunds: {
    list: vi.fn(async () => ({
      data: [] as {
        id: string;
        amount?: number;
        status?: string;
        metadata?: Record<string, string>;
      }[],
    })),
    create: vi.fn(async (...args: unknown[]) => ({ id: 're_created', args })),
  },
  paymentIntents: {
    retrieve: vi.fn(async () => ({ latest_charge: { transfer: 'tr_1' } })),
  },
  transfers: {
    retrieve: vi.fn(async () => ({ id: 'tr_1', amount: 2200, amount_reversed: 0 })),
    listReversals: vi.fn(async () => ({ data: [] as { id: string }[] })),
    createReversal: vi.fn(async (...args: unknown[]) => ({ id: 'trr_created', args })),
  },
};
vi.mock('@/lib/stripe', () => ({ getStripe: () => stripeStub }));

import { settleRefund } from './settleRefund';

/** A $20 piece with $5 shipping, a $1.06 service fee and $2.15 of tax — the
 *  same numbers as the go-live walkthrough, so the split assertions here read
 *  against something a human has actually paid. */
const BASE_ORDER = {
  id: 'o1',
  status: 'paid',
  stripe_payment_intent_id: 'pi_1',
  amount_cents: 2000,
  shipping_cents: 500,
  buyer_fee_cents: 106,
  amount_tax_cents: 215,
  artist_payout_cents: 2200,
  listing_id: 'l1',
  stripe_refund_id: null as string | null,
  stripe_reversal_id: null as string | null,
  refund_approved_at: '2026-09-01T00:00:00Z',
  refund_reason: null as string | null,
  shipped_at: null as string | null,
  is_pickup: false,
  delivered_at: null as string | null,
  pickup_confirmed_by_buyer_at: null as string | null,
  pickup_confirmed_by_artist_at: null as string | null,
};

/** A return that has come back and passed inspection — the state in which
 *  the gate lets money move. */
const ACCEPTED_RETURN = {
  id: 'r1',
  required: true,
  shipped_back_at: '2026-09-01T00:00:00Z',
  received_at: '2026-09-02T00:00:00Z',
  inspection_outcome: 'accepted' as const,
  waived_at: null,
};

type State = {
  order: Record<string, unknown>;
  ret?: Record<string, unknown> | null;
  retError?: { message: string } | null;
  reasonWriteError?: { message: string } | null;
  otherLiveOrders?: number;
};

/** The service-role client, stubbed down to the queries settleRefund makes.
 *  Every builder method returns the builder; the terminals resolve from state.
 *  `updates` records what was written, which is what most of these tests are
 *  actually asserting on. */
function makeAdmin(state: State) {
  const updates: { table: string; payload: Record<string, unknown> }[] = [];

  function from(table: string) {
    const op: {
      kind: 'select' | 'update';
      payload: Record<string, unknown>;
      head: boolean;
      /** `.is(col, value)` predicates, evaluated against the order row at
       *  resolve time. Modelled rather than ignored: the bug this file exists
       *  to pin was a `.is('refund_reason', null)` on the reason write, and a
       *  stub that swallows filters cannot see it — the test passed against
       *  the broken code until this went in. */
      isFilters: [string, unknown][];
    } = { kind: 'select', payload: {}, head: false, isFilters: [] };

    function filtersMatch() {
      return op.isFilters.every(([col, val]) => (state.order as Record<string, unknown>)[col] === val);
    }

    async function resolve() {
      if (op.kind === 'update') {
        if (table === 'listings') return { data: { id: 'l1' }, error: null };
        // A filtered update that matches nothing writes nothing.
        if (!filtersMatch()) return { data: null, error: null };
        updates.push({ table, payload: op.payload });
        if ('status' in op.payload) return { data: { id: 'o1' }, error: null };
        if ('refund_reason' in op.payload) {
          return { data: null, error: state.reasonWriteError ?? null };
        }
        return { data: null, error: null };
      }
      if (table === 'order_returns') {
        return { data: state.ret ?? null, error: state.retError ?? null };
      }
      if (op.head) return { count: state.otherLiveOrders ?? 0, error: null };
      return { data: state.order, error: null };
    }

    const builder: Record<string, unknown> = {
      select: (_cols?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) op.head = true;
        return builder;
      },
      update: (payload: Record<string, unknown>) => {
        op.kind = 'update';
        op.payload = payload;
        return builder;
      },
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: (col: string, val: unknown) => {
        op.isFilters.push([col, val]);
        return builder;
      },
      single: resolve,
      maybeSingle: resolve,
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => resolve().then(ok, bad),
    };
    return builder;
  }

  return { client: { from } as never, updates };
}

function reasonWrites(updates: { table: string; payload: Record<string, unknown> }[]) {
  return updates.filter((u) => u.table === 'orders' && 'refund_reason' in u.payload);
}

beforeEach(() => {
  vi.clearAllMocks();
  stripeStub.refunds.list.mockResolvedValue({ data: [] });
  stripeStub.refunds.create.mockResolvedValue({ id: 're_created', args: [] });
  stripeStub.transfers.listReversals.mockResolvedValue({ data: [] });
  stripeStub.transfers.retrieve.mockResolvedValue({ id: 'tr_1', amount: 2200, amount_reversed: 0 });
  stripeStub.transfers.createReversal.mockResolvedValue({ id: 'trr_created', args: [] });
});

describe('settleRefund — the reason and the money agree', () => {
  it('overwrites an approval-time reason with the reason actually settled under', async () => {
    // The approve-refund route stamps change_of_mind. The admin then settles
    // as not_as_described, which returns the fee — and the row has to say so,
    // or the buyer reads "service fee retained" over a full refund.
    const { client, updates } = makeAdmin({
      order: { ...BASE_ORDER, refund_reason: 'change_of_mind' },
      ret: ACCEPTED_RETURN,
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'not_as_described',
      initiatedBy: 'platform',
    });

    expect(out.ok).toBe(true);
    expect(reasonWrites(updates).at(-1)?.payload.refund_reason).toBe('not_as_described');
    // Fault split: the entire charge, fee and all the tax included.
    expect(out.ok && out.refundedCents).toBe(2000 + 500 + 106 + 215);
  });

  it('refuses a re-settle under a different reason once the money is at Stripe', async () => {
    const { client, updates } = makeAdmin({
      order: { ...BASE_ORDER, stripe_refund_id: 're_old', refund_reason: 'change_of_mind' },
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'not_as_described',
      initiatedBy: 'platform',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(409);
    expect(!out.ok && out.error).toContain('already refunded at Stripe');
    expect(reasonWrites(updates)).toHaveLength(0);
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
  });

  it('moves no money when the decision cannot be recorded', async () => {
    const { client } = makeAdmin({
      order: { ...BASE_ORDER },
      ret: ACCEPTED_RETURN,
      reasonWriteError: { message: 'statement timeout' },
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(502);
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
  });
});

describe('settleRefund — a half-finished settle can always be finished', () => {
  it('skips the return gate on a resume, so a refunded buyer cannot leave the order open', async () => {
    // Money is at Stripe. The return gate would otherwise turn this retry away
    // and leave the order `paid` — buyer refunded, artist free to ship.
    const { client } = makeAdmin({
      order: { ...BASE_ORDER, stripe_refund_id: 're_old', refund_reason: 'change_of_mind' },
      ret: { ...ACCEPTED_RETURN, shipped_back_at: null, received_at: null, inspection_outcome: null },
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
  });

  it('blocks the FIRST settle when the required return has not come back', async () => {
    const { client } = makeAdmin({
      order: { ...BASE_ORDER },
      ret: { ...ACCEPTED_RETURN, shipped_back_at: null, received_at: null, inspection_outcome: null },
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(409);
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
  });

  it('skips the artist-approval gate on a resume', async () => {
    const { client } = makeAdmin({
      order: {
        ...BASE_ORDER,
        stripe_refund_id: 're_old',
        refund_approved_at: null,
        refund_reason: 'change_of_mind',
      },
    });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
  });

  it('still demands artist approval on a FIRST change-of-mind settle', async () => {
    const { client } = makeAdmin({ order: { ...BASE_ORDER, refund_approved_at: null } });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(409);
  });

  it('skips requireUnshipped on a resume but enforces it on a first attempt', async () => {
    const shipped = { ...BASE_ORDER, shipped_at: '2026-09-01T00:00:00Z' };

    const first = await settleRefund(makeAdmin({ order: shipped }).client, {
      orderId: 'o1',
      reason: 'not_shipped',
      initiatedBy: 'buyer',
      requireUnshipped: true,
    });
    expect(first.ok).toBe(false);
    expect(!first.ok && first.status).toBe(409);

    const resume = await settleRefund(
      makeAdmin({
        order: { ...shipped, stripe_refund_id: 're_old', refund_reason: 'not_shipped' },
      }).client,
      { orderId: 'o1', reason: 'not_shipped', initiatedBy: 'buyer', requireUnshipped: true },
    );
    expect(resume.ok).toBe(true);
  });
});

describe('settleRefund — one order, one refund', () => {
  const CHANGE_OF_MIND_TOTAL = 2000 + 500 + (215 - 9);

  it('adopts its OWN refund when the id write was the thing that failed', async () => {
    // The hole this closes: a refund created on a previous attempt whose id
    // write did not land. Re-sending `refund_<id>` with a different reason or
    // note is rejected outright by Stripe, and the retry never recovers.
    // Adoption is allowed only because this refund is, to the cent and to the
    // metadata, the one this settle would have created.
    stripeStub.refunds.list.mockResolvedValue({
      data: [
        {
          id: 're_already_there',
          amount: CHANGE_OF_MIND_TOTAL,
          status: 'succeeded',
          metadata: { order_id: 'o1' },
        },
      ],
    });
    const { client, updates } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
    expect(updates.some((u) => u.payload.stripe_refund_id === 're_already_there')).toBe(true);
  });

  it('REFUSES a hand-issued partial refund instead of calling the order fully refunded', async () => {
    // The P0. Support refunds $25 of a $28.21 order as a goodwill gesture.
    // Adopting it closed the order as refunded, reversed the artist's entire
    // payout and relisted the piece, while telling the admin the buyer had
    // been refunded in full. Nothing downstream catches it: charge.refunded
    // returns early on a partial and the reconcile cron reads any refund at
    // all as "refunded".
    stripeStub.refunds.list.mockResolvedValue({
      data: [{ id: 're_by_hand', amount: 2500, status: 'succeeded' }],
    });
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(409);
    expect(!out.ok && out.error).toContain('$25.00');
    expect(!out.ok && out.error).toContain('$27.06');
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
    expect(stripeStub.transfers.createReversal).not.toHaveBeenCalled();
  });

  it('REFUSES when our own earlier refund was for a different reason and amount', async () => {
    // A change-of-mind refund succeeded at Stripe but its id was lost, so
    // `moneyHasMoved` is false and the reason-mismatch guard cannot fire. The
    // amount check is what catches it.
    stripeStub.refunds.list.mockResolvedValue({
      data: [
        {
          id: 're_earlier',
          amount: CHANGE_OF_MIND_TOTAL,
          status: 'succeeded',
          metadata: { order_id: 'o1' },
        },
      ],
    });
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'not_as_described',
      initiatedBy: 'platform',
    });

    expect(out.ok).toBe(false);
    expect(!out.ok && out.status).toBe(409);
    expect(stripeStub.refunds.create).not.toHaveBeenCalled();
  });

  it('ignores a failed refund, which moved no money and is not in the way', async () => {
    stripeStub.refunds.list.mockResolvedValue({
      data: [{ id: 're_failed', amount: 2500, status: 'failed' }],
    });
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
    expect(stripeStub.refunds.create).toHaveBeenCalledTimes(1);
  });

  it('reverses only the SHORTFALL when part of the payout has already come back', async () => {
    // The reversal twin of the P0. A dashboard refund with "reverse transfer"
    // ticked leaves a partial reversal; adopting it reported the whole payout
    // as reversed and the platform quietly funded the difference.
    stripeStub.transfers.retrieve.mockResolvedValue({
      id: 'tr_1',
      amount: 2200,
      amount_reversed: 700,
    });
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
    expect(stripeStub.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(stripeStub.transfers.createReversal.mock.calls[0][1]).toEqual({ amount: 1500 });
    // Reported as the truth: 700 already back plus the 1500 just taken.
    expect(out.ok && out.payoutReversedCents).toBe(2200);
  });

  it('takes nothing further when the payout is already fully reversed', async () => {
    stripeStub.transfers.retrieve.mockResolvedValue({
      id: 'tr_1',
      amount: 2200,
      amount_reversed: 2200,
    });
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
    expect(stripeStub.transfers.createReversal).not.toHaveBeenCalled();
    expect(out.ok && out.payoutReversedCents).toBe(2200);
  });

  it('creates both when Stripe has nothing, under per-order keys', async () => {
    const { client } = makeAdmin({ order: { ...BASE_ORDER }, ret: ACCEPTED_RETURN });

    const out = await settleRefund(client, {
      orderId: 'o1',
      reason: 'change_of_mind',
      initiatedBy: 'artist',
    });

    expect(out.ok).toBe(true);
    expect(stripeStub.refunds.create).toHaveBeenCalledTimes(1);
    expect(stripeStub.refunds.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'refund_o1' });
    // The reversal key carries the amount: two runs computing the same
    // shortfall collapse into one reversal, and a different shortfall is a
    // different request rather than a silently swallowed one.
    expect(stripeStub.transfers.createReversal.mock.calls[0][2]).toEqual({
      idempotencyKey: 'reversal_o1_2200',
    });
    // Change of mind: the fee and its tax stay behind.
    expect(out.ok && out.refundedCents).toBe(CHANGE_OF_MIND_TOTAL);
    expect(out.ok && out.payoutReversedCents).toBe(2200);
  });
});
