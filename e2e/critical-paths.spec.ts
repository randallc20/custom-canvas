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
    // getByText substring-matches: bare 'Title' also hits "entitled" in the
    // AI-policy paragraph — target the labeled input.
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByRole('button', { name: /save as draft/i })).toBeVisible();
  });
});

test.describe('critical paths — money (opt-in)', () => {
  test.skip(!paymentsOn || !buyer, 'set E2E_PAYMENTS=1 + buyer creds against a payments-enabled target');

  test('buyer completes a Stripe test-card purchase', async ({ page }) => {
    // Full journey: login → find listing → shipping form → Stripe hosted page
    // → webhook → success banner. 30s default is not enough.
    test.setTimeout(150_000);
    await login(page, buyer!.email, buyer!.password);

    // The real flow: pick an available listing via the API (home cards are
    // image links with artwork titles, not "view" buttons), open its page,
    // Buy Now → the app's /checkout/[id] shipping page → Stripe's HOSTED
    // checkout (a full-page redirect, NOT an iframe) → /orders?success=true.
    // Find the Stripe-onboarded artist via the artists API (stripe_onboarded
    // is public), then one of their available listings. Deliberately ZERO
    // calls to /api/payments here — it's rate-limited to 10/min and probing
    // it per-listing exhausts the budget before the real checkout.
    const artists = await (await page.request.get('/api/artists')).json();
    const seller = artists.find((a: { stripe_onboarded: boolean }) => a.stripe_onboarded);
    expect(seller, 'no Stripe-onboarded artist seeded').toBeTruthy();
    const listings = await (await page.request.get('/api/listings')).json();
    const target = listings.find(
      (l: { artist_id: string; price_visible: boolean | null }) =>
        l.artist_id === seller.id && l.price_visible !== false
    );
    expect(target, 'onboarded artist has no purchasable listing').toBeTruthy();
    await page.goto(`/listing/${target.id}`);
    await page.getByRole('button', { name: /buy now/i }).click();

    // App shipping page (pickup-only artists skip the address fields).
    await expect(page).toHaveURL(/\/checkout\//);
    // The checkout Inputs have labels but no ids, and label-text queries can
    // hit the navbar's location picker — target unique placeholders. WAIT for
    // hydration explicitly: right after navigation the URL matches but the
    // form isn't mounted, and a quick isVisible() check would skip the fills
    // and strand the test on a disabled Pay button. (The seeded onboarded
    // artist ships, so the address form is always present here.)
    const street = page.getByPlaceholder('123 Main St');
    await street.waitFor({ state: 'visible', timeout: 15_000 });
    await street.fill('123 Main St');
    await page.getByPlaceholder('Your city').fill('Houston');
    await page.getByPlaceholder('TX').fill('TX');
    await page.getByPlaceholder('77001').fill('77001');
    await page.getByRole('button', { name: /^pay/i }).click();

    // Stripe hosted checkout: an accordion of payment methods; the card form
    // (page-level inputs with stable name= attrs, verified by live inventory)
    // expands after selecting the Card radio. Billing address is required.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    const field = (name: string) => page.locator(`input[name="${name}"]`).first();
    await field('email').waitFor({ state: 'visible', timeout: 20_000 });
    await field('email').fill(buyer!.email);
    await page.getByRole('radio', { name: /card/i }).first().click({ force: true });
    await field('cardNumber').waitFor({ state: 'visible', timeout: 15_000 });
    await field('cardNumber').fill('4242424242424242');
    await field('cardExpiry').fill('12/34');
    await field('cardCvc').fill('123');
    await field('billingName').fill('E2E Buyer');
    await field('billingAddressLine1').fill('123 Main St');
    // Address may collapse into an autocomplete — fill locality/ZIP if shown.
    for (const nm of ['billingLocality', 'billingPostalCode'] as const) {
      const f = field(nm);
      if (await f.isVisible().catch(() => false)) {
        await f.fill(nm === 'billingPostalCode' ? '77001' : 'Houston');
      }
    }
    // Stripe pre-checks "Save my info" (Link), which makes phone REQUIRED —
    // and an empty phone silently blocks Pay on validation. Opt out.
    const linkOptIn = page.locator('input[name="enableStripePass"]').first();
    if (await linkOptIn.isChecked().catch(() => false)) {
      await linkOptIn.uncheck({ force: true });
    }
    await page.getByTestId('hosted-payment-submit-button').click();

    // Back on the app: the orders page success banner.
    await page.waitForURL(/\/orders\?success=true/, { timeout: 45_000 });
    await expect(page.getByText(/purchase was successful/i)).toBeVisible({ timeout: 15_000 });
  });
});
