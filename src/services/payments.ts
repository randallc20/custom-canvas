export async function createStripeConnectLink(artistProfileId: string): Promise<{ url: string }> {
  const response = await fetch('/api/payments/stripe-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistProfileId }),
  });

  if (!response.ok) throw new Error('Failed to create Stripe Connect link');
  return response.json();
}
