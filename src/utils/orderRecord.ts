import { calcSplit } from '@/utils/commissionCalc';

export interface CheckoutSessionLike {
  payment_intent: string | null;
  metadata: {
    listing_id?: string;
    buyer_id?: string;
    shipping_address?: string;
    shipping_cents?: string;
    price_cents?: string;
    buyer_fee_cents?: string;
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
}

// Pure money math for webhook order creation — kept side-effect-free so the
// mandatory money tests can exercise it with mocked Stripe sessions.
// Amounts come from session metadata (locked at session creation), never the
// live listing row: the artist may have edited the price after the buyer
// opened checkout, but Stripe charged the session's amounts. Missing money
// metadata returns null — the webhook must NOT fabricate amounts (the old
// live-listing-price and legacy-flat-fee fallbacks could mis-record the
// exact payout the refund reversal depends on).
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
  const split = calcSplit(priceCents, shippingCents);
  const shippingRaw = session.metadata?.shipping_address;

  return {
    listing_id: listingId,
    buyer_id: buyerId,
    artist_id: artistId,
    amount_cents: priceCents,
    platform_fee_cents: split.platformCommission + lockedFee,
    artist_payout_cents: split.artistPayout,
    buyer_fee_cents: lockedFee,
    shipping_cents: split.shippingCents,
    amount_tax_cents: session.total_details?.amount_tax ?? 0,
    stripe_payment_intent_id: session.payment_intent as string,
    shipping_address: shippingRaw ? JSON.parse(shippingRaw) : null,
    status: 'paid',
  };
}
