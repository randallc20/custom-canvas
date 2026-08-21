export const PLATFORM_RATE = 0.15;

// Stripe standard US card pricing. The buyer service fee is grossed up so the
// fee Stripe charges on the FULL amount (fee included) is covered — see
// calcBuyerFee. Update both if Stripe repricing lands.
//
// Deliberately NOT covered (accepted platform cost, see DECISIONS.md):
// Stripe's percentage on the TAX portion of the charge (~$2.50 on a $1k TX
// sale), Stripe Tax's 50¢/transaction API fee, and international-card
// surcharges. The rate stays 0.029 — do not gross these in.
export const STRIPE_PERCENT = 0.029;
export const STRIPE_FIXED_CENTS = 30;

// Single source of truth for the fee line label. Kept deliberately plain
// ("Service fee") per feedback — the formula lives in about/terms copy.
// NOTE: this fee is charged on every order regardless of payment method. It is
// deliberately NOT a card surcharge, which would carry network disclosure
// rules, a rate cap, and state-level restrictions.
export const BUYER_FEE_LABEL = 'Service fee';

export interface Split {
  platformCommission: number;
  artistPayout: number;
  buyerTotal: number;
  platformRevenue: number;
  buyerFee: number;
  shippingCents: number;
}

/**
 * Buyer-paid service fee, sized to cover Stripe's base processing fee.
 *
 * Stripe charges its percentage on the total captured — which includes this
 * fee — so a naive `pct * subtotal + fixed` under-collects. Solving
 *
 *   fee = pct * (subtotal + fee) + fixed
 *
 * for fee gives the gross-up below. Rounded UP so the platform is never left
 * a cent short; the buyer overpays by at most $0.01.
 *
 * Applies to price + shipping, since Stripe's fee is charged on both.
 */
export function calcBuyerFee(priceCents: number, shippingCents = 0): number {
  const subtotal = priceCents + shippingCents;
  return Math.ceil(
    (STRIPE_PERCENT * subtotal + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT)
  );
}

export function calcSplit(priceCents: number, shippingCents = 0): Split {
  const platformCommission = Math.round(priceCents * PLATFORM_RATE);
  const buyerFee = calcBuyerFee(priceCents, shippingCents);
  const artistPayout = priceCents - platformCommission + shippingCents;
  const buyerTotal = priceCents + buyerFee + shippingCents;
  // The buyer fee passes straight through to Stripe, so platform revenue is
  // the commission alone. buyerFee is tracked separately for reporting.
  const platformRevenue = platformCommission;
  return {
    platformCommission,
    artistPayout,
    buyerTotal,
    platformRevenue,
    buyerFee,
    shippingCents,
  };
}
// $300 + $20 shipping → buyer pays $329.87, artist gets $275, platform nets $45
