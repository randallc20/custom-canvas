import { calculateCommission } from '@/utils/commissionCalc';

export async function createCheckoutSession(
  listingId: string,
  buyerId: string,
  artistStripeAccountId: string,
  amountCents: number
): Promise<{ url: string }> {
  const { platformFeeCents } = calculateCommission(amountCents);

  const response = await fetch('/api/payments/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId,
      buyerId,
      artistStripeAccountId,
      amountCents,
      platformFeeCents,
    }),
  });

  if (!response.ok) throw new Error('Failed to create checkout session');
  return response.json();
}

export async function createStripeConnectLink(artistProfileId: string): Promise<{ url: string }> {
  const response = await fetch('/api/payments/stripe-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistProfileId }),
  });

  if (!response.ok) throw new Error('Failed to create Stripe Connect link');
  return response.json();
}
