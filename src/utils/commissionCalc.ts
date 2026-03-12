const PLATFORM_FEE_PERCENT = 15;

export function calculateCommission(amountCents: number): {
  platformFeeCents: number;
  artistPayoutCents: number;
} {
  const platformFeeCents = Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100));
  const artistPayoutCents = amountCents - platformFeeCents;

  return { platformFeeCents, artistPayoutCents };
}
