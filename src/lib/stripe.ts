import Stripe from 'stripe';

// Lazy singleton — instantiating at module scope crashes `next build`
// when STRIPE_SECRET_KEY is absent (e.g. CI without secrets).
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }
  return client;
}

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
