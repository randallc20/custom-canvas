// Launch feature flags. Payments stay off until Stripe live activation is
// approved — flip NEXT_PUBLIC_PAYMENTS_ENABLED=true in the production env and
// buying turns on with no code change or redeploy.
export const paymentsEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
