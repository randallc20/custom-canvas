import type { ArtistSalesTotalsRow } from '@/services/orders';

export interface SalesSummary {
  /** Payout across every order that was not refunded. */
  earningsCents: number;
  /** Orders that were not refunded. */
  salesCount: number;
  /** Paid orders still to ship. */
  awaitingShipment: number;
}

/** Folds the per-status rows of artist_sales_totals into the three Studio
 *  headline numbers. Mirrors the old client-side reduce over every order
 *  (status !== 'refunded'), so the figures do not move with the switch. */
export function summarizeSales(rows: ArtistSalesTotalsRow[] | undefined): SalesSummary {
  const summary: SalesSummary = { earningsCents: 0, salesCount: 0, awaitingShipment: 0 };
  for (const row of rows ?? []) {
    if (row.status !== 'refunded') {
      summary.earningsCents += row.payout_cents;
      summary.salesCount += row.order_count;
    }
    if (row.status === 'paid') summary.awaitingShipment += row.order_count;
  }
  return summary;
}
