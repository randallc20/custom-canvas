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
    // Open the first available listing and start checkout.
    await page.goto('/');
    await page.getByRole('link', { name: /view|details/i }).first().click();
    await page.getByRole('button', { name: /buy|purchase|checkout/i }).first().click();
    // Stripe hosted checkout — fill the universally-accepted test card.
    const frame = page.frameLocator('iframe[name*="card"], iframe[title*="card" i]').first();
    await frame.getByPlaceholder(/card number/i).fill('4242424242424242');
    await frame.getByPlaceholder(/mm ?\/ ?yy/i).fill('12/34');
    await frame.getByPlaceholder(/cvc/i).fill('123');
    await page.getByRole('button', { name: /pay/i }).click();
    // Back on the app: order confirmation.
    await expect(page.getByText(/thank you|order (confirmed|placed)|payment received/i)).toBeVisible({
      timeout: 30_000,
    });
  });
});
