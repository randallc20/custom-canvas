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

// Connected-account events (account.updated for artists) are delivered by a
// SEPARATE Connect endpoint, which signs with its own secret. Without this,
// every such event fails signature verification and is silently rejected —
// artists finish Stripe onboarding and never become sellable.
export const STRIPE_CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
