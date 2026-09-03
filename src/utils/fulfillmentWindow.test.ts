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

  it('honours an extended window the buyer agreed to', () => {
    // accept-ship-by widens fulfillment_window_days; the prompts must stop
    // nagging a buyer who has already consented to the delay.
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
