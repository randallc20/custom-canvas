export const PLATFORM_RATE = 0.15;
export const BUYER_FEE_RATE = 0.05;
export const BUYER_FEE_CAP_CENTS = 1500; // 5% service fee, capped at $15

// Single source of truth for the fee line label. Kept deliberately plain
// ("Service fee") per feedback — the formula lives in about/terms copy.
export const BUYER_FEE_LABEL = 'Service fee';

export interface Split {
  platformCommission: number;
  artistPayout: number;
  buyerTotal: number;
  platformRevenue: number;
  buyerFee: number;
  shippingCents: number;
}

export function calcBuyerFee(priceCents: number): number {
  return Math.min(Math.round(priceCents * BUYER_FEE_RATE), BUYER_FEE_CAP_CENTS);
}

export function calcSplit(priceCents: number, shippingCents = 0): Split {
  const platformCommission = Math.round(priceCents * PLATFORM_RATE);
  const buyerFee = calcBuyerFee(priceCents);
  const artistPayout = priceCents - platformCommission + shippingCents;
  const buyerTotal = priceCents + buyerFee + shippingCents;
  const platformRevenue = platformCommission + buyerFee;
  return {
    platformCommission,
    artistPayout,
    buyerTotal,
    platformRevenue,
    buyerFee,
    shippingCents,
  };
}
// $300 + $20 shipping → buyer pays $335, artist gets $275, platform gets $60
