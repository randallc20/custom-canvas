import {
  DEFAULT_FULFILLMENT_WINDOW_DAYS,
  addBusinessDays,
  businessDaysBetween,
} from './evaluateProtection';

/**
 * The shipping promise, in one place (L7).
 *
 * The listing says "ships within 5 business days". Terms of Sale §3 and
 * Artist Agreement §7 turn that into a date the buyer can rely on and, if it
 * passes, a right to cancel. Both order cards, the cron and the cancel route
 * have to agree on that date exactly — an artist told one deadline and held
 * to another is the whole failure this phase exists to prevent — so the
 * arithmetic lives here and nowhere else.
 */
export type FulfillmentWindow = {
  /** ISO instant the artist promised to ship by. */
  shipByIso: string;
  /** "September 10, 2026". */
  shipByText: string;
  /** True once the window has passed with no shipment. */
  missed: boolean;
  /** Business days the window allows (extended if the buyer accepted a new
   *  date; the seller-protection window is NOT extended with it). */
  windowDays: number;
};

export function fulfillmentWindow(
  order: {
    created_at: string;
    shipped_at?: string | null;
    fulfillment_window_days?: number | null;
  },
  now: Date = new Date(),
): FulfillmentWindow {
  const windowDays = order.fulfillment_window_days ?? DEFAULT_FULFILLMENT_WINDOW_DAYS;
  const shipByIso = addBusinessDays(order.created_at, windowDays);
  return {
    shipByIso,
    shipByText: formatDate(shipByIso),
    missed: !order.shipped_at && businessDaysBetween(order.created_at, now.toISOString()) > windowDays,
    windowDays,
  };
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
