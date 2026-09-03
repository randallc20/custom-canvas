import { DEFAULT_FULFILLMENT_WINDOW_DAYS, addBusinessDays } from './evaluateProtection';

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
  /** ISO instant the piece is currently promised by — the original window, or
   *  a later date the BUYER accepted. */
  shipByIso: string;
  /** "September 10, 2026". */
  shipByText: string;
  /** True once the operative date has passed with no shipment. */
  missed: boolean;
  /** Business days the ORIGINAL window allowed. Seller-protection requirement
   *  1 is measured against this and nothing moves it — see `agreed`. */
  windowDays: number;
  /** True when the buyer consented to a later date. The prompts and the cron
   *  respect it; protection does not. */
  agreed: boolean;
};

export function fulfillmentWindow(
  order: {
    created_at: string;
    shipped_at?: string | null;
    fulfillment_window_days?: number | null;
    agreed_ship_by?: string | null;
  },
  now: Date = new Date(),
): FulfillmentWindow {
  // The checkout snapshot. Requirement 1 is judged against this, always: an
  // artist cannot buy protection back by asking the buyer for more time (r5
  // money pass, P1).
  const windowDays = order.fulfillment_window_days ?? DEFAULT_FULFILLMENT_WINDOW_DAYS;
  const originalIso = addBusinessDays(order.created_at, windowDays);

  // …but the date shown, and the point at which the buyer's cancel right and
  // the cron wake up, is whatever the buyer last agreed to.
  const agreed = !!order.agreed_ship_by;
  const shipByIso = agreed ? (order.agreed_ship_by as string) : originalIso;

  // A ship-by is a DAY, not an instant. The buyer is shown "ships by
  // September 10", so the promise is not broken until September 10 is over —
  // comparing instants would mark an order placed at 7pm Houston time as
  // missed at 7pm on the promised day, hours before the artist's own deadline
  // as they read it (r5 money pass, P3), and would let the buyer cancel a
  // sale the artist still had the day to ship.
  // End of the promised day in HOUSTON, not in UTC. Setting 23:59 UTC made
  // the window expire at 6:59pm local on the promised day — before the
  // artist's own working day was over — which is the same off-by-a-timezone
  // the first cut of this had (r6 money pass, P2). CST is UTC-6 and CDT
  // UTC-5; six hours is used deliberately so the boundary is never EARLIER
  // than the artist's midnight, only ever up to an hour later. Erring in the
  // artist's favour is the right direction: the cost of being early is
  // cancelling a sale they still had time to ship.
  const deadline = new Date(shipByIso);
  deadline.setUTCHours(23, 59, 59, 999);
  deadline.setTime(deadline.getTime() + 6 * 60 * 60 * 1000);

  return {
    shipByIso,
    shipByText: formatDate(shipByIso),
    missed: !order.shipped_at && now.getTime() > deadline.getTime(),
    windowDays,
    agreed,
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
