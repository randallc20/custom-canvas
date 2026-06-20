import { test } from '@playwright/test';

// The 5 critical authenticated paths from the launch plan. These require seeded
// test accounts + Stripe test mode; fill the env vars and remove .skip to run.
// E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD / E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD
test.describe.skip('critical paths (need seeded accounts)', () => {
  test('register -> onboard -> profile live', async () => { /* TODO */ });
  test('create listing with image', async () => { /* TODO */ });
  test('purchase with Stripe test card -> order created', async () => { /* TODO */ });
  test('commission request -> quote -> accept -> deposit', async () => { /* TODO */ });
  test('send/receive message in realtime', async () => { /* TODO */ });
});
