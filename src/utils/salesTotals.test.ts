import { describe, it, expect } from 'vitest';
import { summarizeSales } from './salesTotals';

describe('summarizeSales', () => {
  it('is all zeros with no rows', () => {
    expect(summarizeSales(undefined)).toEqual({ earningsCents: 0, salesCount: 0, awaitingShipment: 0 });
    expect(summarizeSales([])).toEqual({ earningsCents: 0, salesCount: 0, awaitingShipment: 0 });
  });

  it('excludes refunded orders from earnings and sales, counts paid as awaiting shipment', () => {
    expect(
      summarizeSales([
        { status: 'paid', order_count: 2, payout_cents: 17000 },
        { status: 'shipped', order_count: 1, payout_cents: 8500 },
        { status: 'delivered', order_count: 3, payout_cents: 25500 },
        { status: 'disputed', order_count: 1, payout_cents: 8500 },
        { status: 'refunded', order_count: 4, payout_cents: 34000 },
      ])
    ).toEqual({ earningsCents: 59500, salesCount: 7, awaitingShipment: 2 });
  });
});
