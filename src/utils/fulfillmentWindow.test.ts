import { describe, expect, it } from 'vitest';
import { fulfillmentWindow, formatDate } from './fulfillmentWindow';

/**
 * L7 — the shipping promise. The listing says "ships within 5 business days";
 * Terms of Sale §3 turns that into a date the buyer can rely on and, once it
 * passes, a unilateral right to cancel for a full refund. The buyer's card,
 * the artist's card, the cron and the cancel route all read this one function,
 * because an artist told one deadline and held to another is the exact failure
 * this phase exists to prevent.
 */
describe('fulfillmentWindow', () => {
  // Monday 2026-08-03.
  const created = '2026-08-03T12:00:00.000Z';

  it('promises the fifth business day after the sale', () => {
    // Mon + 5 business days = the following Monday (weekend skipped).
    const win = fulfillmentWindow({ created_at: created }, new Date('2026-08-04T12:00:00Z'));
    expect(win.shipByIso.slice(0, 10)).toBe('2026-08-10');
    expect(win.windowDays).toBe(5);
    expect(win.missed).toBe(false);
  });

  it('is not missed on the promised day itself', () => {
    // Exactly 5 business days elapsed — the window allows 5, so this is the
    // last day, not a breach. `>` and not `>=` is the difference between
    // honouring the promise and cancelling a sale a day early.
    const win = fulfillmentWindow({ created_at: created }, new Date('2026-08-10T23:00:00Z'));
    expect(win.missed).toBe(false);
  });

  it('is missed on the sixth business day', () => {
    const win = fulfillmentWindow({ created_at: created }, new Date('2026-08-11T00:30:00Z'));
    expect(win.missed).toBe(true);
  });

  it('is never missed once the piece has shipped, however late', () => {
    const win = fulfillmentWindow(
      { created_at: created, shipped_at: '2026-09-01T12:00:00Z' },
      new Date('2026-10-01T12:00:00Z'),
    );
    expect(win.missed).toBe(false);
  });

  it('honours a wider window snapshotted at checkout', () => {
    // fulfillment_window_days is the CHECKOUT snapshot. accept-ship-by no
    // longer writes it — the buyer's consent lives in agreed_ship_by — but a
    // per-order window set at sale time is still honoured here.
    const win = fulfillmentWindow(
      { created_at: created, fulfillment_window_days: 20 },
      new Date('2026-08-14T12:00:00Z'),
    );
    expect(win.missed).toBe(false);
    expect(win.windowDays).toBe(20);
  });

  it('weekend sales do not lose days', () => {
    // Saturday 2026-08-01 + 5 business days: Mon-Fri of the following week.
    const win = fulfillmentWindow({ created_at: '2026-08-01T12:00:00.000Z' }, new Date('2026-08-03T12:00:00Z'));
    expect(win.shipByIso.slice(0, 10)).toBe('2026-08-07');
  });

  it('formats in UTC so a date never slips a day for a US viewer', () => {
    expect(formatDate('2026-08-10T00:30:00.000Z')).toBe('August 10, 2026');
    expect(formatDate('not-a-date')).toBe('');
  });
});

/**
 * The r5 money review found two things here, and both are about the same
 * mistake: treating a promise made in days as if it were an instant, and
 * treating the buyer's consent to a later date as if it moved the
 * seller-protection bar.
 */
describe('fulfillmentWindow — the r5 findings', () => {
  const created = '2026-08-03T12:00:00.000Z';

  it('an evening order is not missed at the same hour on the promised day (P3)', () => {
    // Placed 7pm Houston = 2026-08-04T00:00Z. Whatever the clock says, the
    // artist has the whole of the promised day.
    const evening = '2026-08-04T00:30:00.000Z';
    const win = fulfillmentWindow({ created_at: evening }, new Date(`${fulfillmentWindow({ created_at: evening }).shipByIso.slice(0, 10)}T23:00:00Z`));
    expect(win.missed).toBe(false);
  });

  it('is missed once the promised day is over', () => {
    const win = fulfillmentWindow({ created_at: created }, new Date('2026-08-11T00:30:00Z'));
    expect(win.missed).toBe(true);
  });

  it('an accepted later date moves the prompts but NOT the protection window (P1)', () => {
    // The artist proposed 1 October and the buyer said yes. Requirement 1 is
    // still judged against the original 5 business days — otherwise an artist
    // buys protection back by asking for more time, and Custom Canvas absorbs
    // a chargeback the artist should have borne.
    const win = fulfillmentWindow(
      { created_at: created, agreed_ship_by: '2026-10-01T12:00:00Z' },
      new Date('2026-09-15T12:00:00Z'),
    );
    expect(win.agreed).toBe(true);
    expect(win.shipByText).toBe('October 1, 2026');
    expect(win.missed).toBe(false);
    // The protection bar is untouched.
    expect(win.windowDays).toBe(5);
  });

  it('an accepted date that passes is missed again', () => {
    const win = fulfillmentWindow(
      { created_at: created, agreed_ship_by: '2026-10-01T12:00:00Z' },
      new Date('2026-10-02T00:30:00Z'),
    );
    expect(win.missed).toBe(true);
  });

  it('shipping stops the clock whatever was agreed', () => {
    const win = fulfillmentWindow(
      { created_at: created, agreed_ship_by: '2026-10-01T12:00:00Z', shipped_at: '2026-09-30T12:00:00Z' },
      new Date('2026-12-01T12:00:00Z'),
    );
    expect(win.missed).toBe(false);
  });
});
