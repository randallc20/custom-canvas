// Seller protection evaluation — docs/SELLER_PROTECTION_SPEC.md.
//
// Pure and deterministic: no I/O, no clock reads beyond what's passed in, so
// the money tests can exercise every branch. Called at dispute time to decide
// whether Custom Canvas absorbs the chargeback or reverses the artist's
// payout, and shown optimistically in Studio so an artist can see where they
// stand BEFORE anything goes wrong.

export const SUPPORTED_CARRIERS = ['usps', 'ups', 'fedex', 'dhl'] as const;

/** Signature confirmation is required at and above this order value. Matches
 *  eBay's threshold and the card-network evidence rules. */
export const SIGNATURE_REQUIRED_FROM_CENTS = 75_000;

/** Platform-wide default. Not per-listing at launch: a per-listing window
 *  means a new field, new form UI, and teaching artists a concept they haven't
 *  asked for. Snapshotted per order so changing it later can't rewrite the bar
 *  for sales already made. */
export const DEFAULT_FULFILLMENT_WINDOW_DAYS = 5;

/** A description this short defends nothing in a not-as-described dispute —
 *  "Beautiful abstract in blues, ready to hang" would otherwise clear the bar. */
export const MIN_CONDITION_NOTES_CHARS = 150;

export const MIN_EVIDENCE_PHOTOS = 3;

/** Requirement 6's reply window, in business days. */
export const REPLY_WINDOW_BUSINESS_DAYS = 3;

export interface ProtectionInput {
  isPickup: boolean;
  /** Pickup orders are protected only when both parties confirmed handoff in
   *  the Custom Canvas thread. */
  pickupHandoffConfirmed?: boolean;
  createdAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  signatureRequired: boolean;
  signatureConfirmed: boolean;
  evidencePhotoCount: number;
  evidenceHasConditionNotes: boolean;
  fulfillmentWindowDays: number;
  /** Computed by the caller from the message history: did the artist answer
   *  every buyer message within three business days? True when the buyer never
   *  wrote — there is nothing to answer, so nothing to fail. */
  artistRepliedWithinWindow: boolean;
}

export type ProtectionStatus = 'protected' | 'ineligible';

export interface ProtectionResult {
  status: ProtectionStatus;
  /** Human-readable, artist-facing. Empty when protected. Drives both the
   *  dispute notification and the Studio badge, so it says what to FIX. */
  failures: string[];
}

/** Business days elapsed between two instants, counting Mon–Fri only.
 *  Deliberately ignores public holidays: the window is a floor, and a
 *  holiday calendar is a maintenance burden that would only ever make the
 *  bar stricter for artists. */
export function businessDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Number.POSITIVE_INFINITY;
  if (to <= from) return 0;

  let days = 0;
  const cursor = new Date(from.getTime());
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to.getTime());
  end.setUTCHours(0, 0, 0, 0);

  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

export function evaluateProtection(input: ProtectionInput): ProtectionResult {
  const failures: string[] = [];

  // Local pickup short-circuits the shipping requirements entirely — there is
  // no carrier, no tracking, and no delivery scan to produce.
  if (input.isPickup) {
    if (!input.pickupHandoffConfirmed) {
      failures.push('Pickup handoff was not confirmed by both parties in Messages.');
    }
    return { status: failures.length ? 'ineligible' : 'protected', failures };
  }

  // 1. Shipped within the fulfillment window.
  if (!input.shippedAt) {
    failures.push('The order was never marked shipped.');
  } else if (businessDaysBetween(input.createdAt, input.shippedAt) > input.fulfillmentWindowDays) {
    failures.push(
      `Shipped after the ${input.fulfillmentWindowDays}-business-day fulfillment window.`
    );
  }

  // 2. Tracking from a supported carrier, entered before shipping.
  if (!input.trackingNumber || !input.trackingNumber.trim()) {
    failures.push('No tracking number was entered.');
  }
  if (!input.carrier || !SUPPORTED_CARRIERS.includes(input.carrier as typeof SUPPORTED_CARRIERS[number])) {
    failures.push('No supported carrier was recorded (USPS, UPS, FedEx or DHL).');
  }

  // 3. Carrier confirmed delivery.
  if (!input.deliveredAt) {
    failures.push('Delivery was never confirmed.');
  }

  // 4. Signature confirmation on high-value orders.
  if (input.signatureRequired && !input.signatureConfirmed) {
    failures.push('Signature confirmation is required on orders of $750 or more.');
  }

  // 5. Listing evidence, snapshotted at checkout.
  if (input.evidencePhotoCount < MIN_EVIDENCE_PHOTOS) {
    failures.push(`The listing had fewer than ${MIN_EVIDENCE_PHOTOS} photographs at the time of sale.`);
  }
  if (!input.evidenceHasConditionNotes) {
    failures.push('The listing had no written condition notes at the time of sale.');
  }

  // 6. Responsiveness.
  if (!input.artistRepliedWithinWindow) {
    failures.push(
      `A buyer message went unanswered for more than ${REPLY_WINDOW_BUSINESS_DAYS} business days.`
    );
  }

  return { status: failures.length ? 'ineligible' : 'protected', failures };
}
