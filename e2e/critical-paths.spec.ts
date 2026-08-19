import { test, expect } from '@playwright/test';
import { login, buyerCreds, artistCreds } from './helpers/auth';

// Authenticated critical paths from the go-live plan. These run against staging
// (E2E_BASE_URL, defaults to the staging deploy) using seeded test accounts:
//   E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD
//   E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD
// Each spec skips (not fails) when its creds are absent, so CI without the
// secrets configured stays green while still running the public smoke suite.
//
// The money paths (real Stripe checkout, commission deposit) additionally
// require E2E_PAYMENTS=1 and a payments-enabled target — they mutate orders and
// drive Stripe's hosted page, so they're opt-in rather than on every run.

const buyer = buyerCreds();
const artist = artistCreds();
const paymentsOn = process.env.E2E_PAYMENTS === '1';

test.describe('critical paths — buyer', () => {
  test.skip(!buyer, 'E2E_BUYER_EMAIL/PASSWORD not set');

  test('buyer signs in and the session is cookie-backed', async ({ page }) => {
    await login(page, buyer!.email, buyer!.password);
    // Authenticated navbar exposes Messages; the anonymous /login link is gone.
    await expect(page.locator('a[href="/messages"]').first()).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toHaveCount(0);
  });

  test('authed pages render without bouncing to /login', async ({ page }) => {
    await login(page, buyer!.email, buyer!.password);
    // The Build-3 bug was that cookie-authed routes 401'd in real browsers.
    // Loading each protected page and staying there is the regression guard.
    for (const path of ['/saved', '/orders', '/messages', '/account']) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')));
      await expect(page).not.toHaveURL(/\/login/);
    }
  });
});

test.describe('critical paths — artist', () => {
  test.skip(!artist, 'E2E_ARTIST_EMAIL/PASSWORD not set');

  test('artist signs in and lands in Studio', async ({ page }) => {
    await login(page, artist!.email, artist!.password);
    await expect(page).toHaveURL(/\/studio/);
    await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
  });

  test('artist can open the new-listing form', async ({ page }) => {
    await login(page, artist!.email, artist!.password);
    await page.goto('/listings/new');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText('Title')).toBeVisible();
    await expect(page.getByRole('button', { name: /save as draft/i })).toBeVisible();
  });
});

test.describe('critical paths — money (opt-in)', () => {
  test.skip(!paymentsOn || !buyer, 'set E2E_PAYMENTS=1 + buyer creds against a payments-enabled target');

  test('buyer completes a Stripe test-card purchase', async ({ page }) => {
    await login(page, buyer!.email, buyer!.password);

    // The real flow: pick an available listing via the API (home cards are
    // image links with artwork titles, not "view" buttons), open its page,
    // Buy Now → the app's /checkout/[id] shipping page → Stripe's HOSTED
    // checkout (a full-page redirect, NOT an iframe) → /orders?success=true.
    const listings = await (await page.request.get('/api/listings')).json();
    expect(Array.isArray(listings) && listings.length > 0).toBeTruthy();
    await page.goto(`/listing/${listings[0].id}`);
    await page.getByRole('button', { name: /buy now/i }).click();

    // App shipping page (pickup-only artists skip the address fields).
    await expect(page).toHaveURL(/\/checkout\//);
    const street = page.getByLabel(/street address/i);
    if (await street.isVisible().catch(() => false)) {
      await street.fill('123 Main St');
      await page.getByLabel(/city/i).fill('Houston');
      await page.getByLabel(/state/i).fill('TX');
      await page.getByLabel(/zip/i).fill('77001');
    }
    await page.getByRole('button', { name: /^pay/i }).click();

    // Stripe hosted checkout: page-level inputs on checkout.stripe.com.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    await page.getByLabel(/card number/i).fill('4242424242424242');
    await page.getByLabel(/expiration/i).fill('12/34');
    await page.getByLabel(/cvc|security code/i).fill('123');
    const nameField = page.getByLabel(/name on card|cardholder/i);
    if (await nameField.isVisible().catch(() => false)) await nameField.fill('E2E Buyer');
    const zipField = page.getByLabel(/zip|postal/i).last();
    if (await zipField.isVisible().catch(() => false)) await zipField.fill('77001');
    await page.getByTestId('hosted-payment-submit-button').click();

    // Back on the app: the orders page success banner.
    await page.waitForURL(/\/orders\?success=true/, { timeout: 45_000 });
    await expect(page.getByText(/purchase was successful/i)).toBeVisible({ timeout: 15_000 });
  });
});
