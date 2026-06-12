import { calcSplit } from '@/utils/commissionCalc';

export interface CheckoutSessionLike {
  payment_intent: string | null;
  metadata: {
    listing_id?: string;
    buyer_id?: string;
    shipping_address?: string;
    shipping_cents?: string;
    price_cents?: string;
  } | null;
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
  stripe_payment_intent_id: string;
  shipping_address: Record<string, string> | null;
  status: 'paid';
}

// Pure money math for webhook order creation — kept side-effect-free so the
// mandatory money tests can exercise it with mocked Stripe sessions.
// Amounts come from session metadata (locked at session creation), never the
// live listing row: the artist may have edited the price after the buyer
// opened checkout, but Stripe charged the session's amounts.
export function buildOrderRecord(
  session: CheckoutSessionLike,
  listing: { price_cents: number },
  artistId: string
): OrderRecord | null {
  const listingId = session.metadata?.listing_id;
  const buyerId = session.metadata?.buyer_id;
  if (!listingId || !buyerId) return null;

  const shippingCents = parseInt(session.metadata?.shipping_cents ?? '0', 10) || 0;
  const priceCents = parseInt(session.metadata?.price_cents ?? '', 10) || listing.price_cents;
  const split = calcSplit(priceCents, shippingCents);
  const shippingRaw = session.metadata?.shipping_address;

  return {
    listing_id: listingId,
    buyer_id: buyerId,
    artist_id: artistId,
    amount_cents: priceCents,
    platform_fee_cents: split.platformRevenue,
    artist_payout_cents: split.artistPayout,
    buyer_fee_cents: split.buyerFee,
    shipping_cents: split.shippingCents,
    stripe_payment_intent_id: session.payment_intent as string,
    shipping_address: shippingRaw ? JSON.parse(shippingRaw) : null,
    status: 'paid',
  };
}
