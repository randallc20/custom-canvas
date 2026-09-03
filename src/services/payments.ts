export async function createStripeConnectLink(artistProfileId: string): Promise<{ url: string }> {
  const response = await fetch('/api/payments/stripe-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artistProfileId }),
  });

  if (!response.ok) {
    // Surface the route's plain message (502 from Stripe, failed row write)
    // rather than a generic string the artist cannot act on.
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Failed to create Stripe Connect link');
  }
  return response.json();
}
