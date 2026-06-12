export const PLATFORM_RATE = 0.15;
export const BUYER_FEE_CENTS = 1000; // flat $10

export interface Split {
  platformCommission: number;
  artistPayout: number;
  buyerTotal: number;
  platformRevenue: number;
  buyerFee: number;
  shippingCents: number;
}

export function calcSplit(priceCents: number, shippingCents = 0): Split {
  const platformCommission = Math.round(priceCents * PLATFORM_RATE);
  const artistPayout = priceCents - platformCommission + shippingCents;
  const buyerTotal = priceCents + BUYER_FEE_CENTS + shippingCents;
  const platformRevenue = platformCommission + BUYER_FEE_CENTS;
  return {
    platformCommission,
    artistPayout,
    buyerTotal,
    platformRevenue,
    buyerFee: BUYER_FEE_CENTS,
    shippingCents,
  };
}
// $300 + $20 shipping → buyer pays $330, artist gets $275, platform gets $55
