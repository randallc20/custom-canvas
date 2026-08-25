import { calcSplit } from '@/utils/commissionCalc';
import { DEFAULT_FULFILLMENT_WINDOW_DAYS } from '@/utils/evaluateProtection';

export interface CheckoutSessionLike {
  payment_intent: string | null;
  metadata: {
    listing_id?: string;
    buyer_id?: string;
    shipping_address?: string;
    shipping_cents?: string;
    price_cents?: string;
    buyer_fee_cents?: string;
    artist_payout_cents?: string;
    platform_fee_cents?: string;
    artist_id?: string;
    evidence_photo_count?: string;
    evidence_has_condition_notes?: string;
    fulfillment_window_days?: string;
    signature_required?: string;
  } | null;
  /** The ship-to address Stripe collected AND taxed. Authoritative over the
   *  app-collected metadata copy: it is the address the tax was computed on. */
  collected_information?: {
    shipping_details?: {
      name?: string | null;
      address?: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postal_code?: string | null;
        country?: string | null;
      } | null;
    } | null;
  } | null;
  /** Stripe Tax total for the session — the platform is merchant of record
   *  and must return tax on refunded lines, so it's recorded per order. */
  total_details?: { amount_tax?: number | null } | null;
}

export interface OrderRecord {
  listing_id: string;
  buyer_id: string;
  artist_id: string;
  amount_cents: number;
  platform_fee_cents: number;
  artist_payout_cents: number;
  buyer_fee_cents: number;
  shipping_cents: number;
  amount_tax_cents: number;
  stripe_payment_intent_id: string;
  shipping_address: Record<string, string> | null;
  status: 'paid';
  // Seller-protection evidence, frozen at checkout.
  evidence_photo_count: number;
  evidence_has_condition_notes: boolean;
  fulfillment_window_days: number;
  signature_required: boolean;
}

// Pure money math for webhook order creation — kept side-effect-free so the
// mandatory money tests can exercise it with mocked Stripe sessions.
// Amounts come from session metadata (locked at session creation), never the
// live listing row: the artist may have edited the price after the buyer
// opened checkout, but Stripe charged the session's amounts. Missing money
// metadata returns null — the webhook must NOT fabricate amounts (the old
// live-listing-price and legacy-flat-fee fallbacks could mis-record the
// exact payout the refund reversal depends on).
// Stripe's Address -> the shape the app already stores and renders
// (/orders reads .city/.state/.zip). Also captures the recipient NAME, which
// the app's own form never collected.
function stripeShippingAddress(session: CheckoutSessionLike): Record<string, string> | null {
  const details = session.collected_information?.shipping_details;
  const a = details?.address;
  if (!a || !a.line1) return null;
  return {
    name: details?.name ?? '',
    street: [a.line1, a.line2].filter(Boolean).join(', '),
    city: a.city ?? '',
    state: a.state ?? '',
    zip: a.postal_code ?? '',
    country: a.country ?? 'US',
  };
}

export function buildOrderRecord(
  session: CheckoutSessionLike,
  artistId: string
): OrderRecord | null {
  const listingId = session.metadata?.listing_id;
  const buyerId = session.metadata?.buyer_id;
  if (!listingId || !buyerId) return null;

  const priceCents = parseInt(session.metadata?.price_cents ?? '', 10);
  const lockedFee = parseInt(session.metadata?.buyer_fee_cents ?? '', 10);
  if (Number.isNaN(priceCents) || Number.isNaN(lockedFee)) return null;

  const shippingCents = parseInt(session.metadata?.shipping_cents ?? '0', 10) || 0;

  // Prefer the payout/commission locked at session creation: the payout is the
  // exact amount transfer_data moved to the artist, and the refund reversal
  // depends on the record matching it. Recomputing here would diverge from the
  // real transfer if PLATFORM_RATE were deployed mid-checkout. Sessions created
  // before these keys existed fall back to the formula -- without that, every
  // checkout in flight at deploy time would 500 forever.
  const lockedPayout = parseInt(session.metadata?.artist_payout_cents ?? '', 10);
  const lockedCommission = parseInt(session.metadata?.platform_fee_cents ?? '', 10);
  const split = calcSplit(priceCents, shippingCents);
  const artistPayout = Number.isNaN(lockedPayout) ? split.artistPayout : lockedPayout;
  const platformCommission = Number.isNaN(lockedCommission) ? split.platformCommission : lockedCommission;

  const shippingRaw = session.metadata?.shipping_address;

  return {
    listing_id: listingId,
    buyer_id: buyerId,
    artist_id: artistId,
    amount_cents: priceCents,
    // The buyer fee passes through to Stripe — it is NOT platform revenue.
    // Reports summing platform_fee_cents now see the 15% commission alone;
    // buyer_fee_cents keeps the fee for per-order accounting.
    platform_fee_cents: platformCommission,
    artist_payout_cents: artistPayout,
    buyer_fee_cents: lockedFee,
    shipping_cents: split.shippingCents,
    amount_tax_cents: session.total_details?.amount_tax ?? 0,
    stripe_payment_intent_id: session.payment_intent as string,
    shipping_address: stripeShippingAddress(session) ?? (shippingRaw ? JSON.parse(shippingRaw) : null),
    // Defaults keep sessions created before this shipped buildable: they
    // simply evaluate as ineligible rather than 500ing the webhook forever.
    evidence_photo_count: parseInt(session.metadata?.evidence_photo_count ?? '', 10) || 0,
    evidence_has_condition_notes: session.metadata?.evidence_has_condition_notes === 'true',
    fulfillment_window_days:
      parseInt(session.metadata?.fulfillment_window_days ?? '', 10) || DEFAULT_FULFILLMENT_WINDOW_DAYS,
    signature_required: session.metadata?.signature_required === 'true',
    status: 'paid',
  };
}
