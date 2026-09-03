import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * The two-sided local-pickup handoff (R11 / 05-P3 "tests", item 7 — listed
 * there as having no coverage at all).
 *
 * A pickup order has no carrier, no tracking and no Mark Delivered: its ONLY
 * route to `delivered` is both parties confirming the handoff, and seller
 * protection attaches only when both have (api/orders/[id]/confirm-pickup,
 * utils/evaluateProtection). An artist confirming alone would be
 * manufacturing their own protection, so the halves are asserted separately.
 *
 * Requires (all from scripts/seed-e2e.mjs):
 *   E2E_PICKUP_BUYER_EMAIL / E2E_PICKUP_BUYER_PASSWORD — the throwaway Art
 *     Lover holding the fixture order
 *   E2E_PICKUP_ORDER_ID — that order's id (the UI shows the first 8 chars)
 *   E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD — the seed artist who sold it
 *
 * No Stripe money moves: the fixture order carries a synthetic payment intent
 * and no listing, exactly like the paid-buyer fixture, so this spec does NOT
 * need E2E_MONEY. Never refund it — there is nothing at Stripe behind it.
 */

const buyer = {
  email: process.env.E2E_PICKUP_BUYER_EMAIL,
  password: process.env.E2E_PICKUP_BUYER_PASSWORD,
};
const artist = { email: process.env.E2E_ARTIST_EMAIL, password: process.env.E2E_ARTIST_PASSWORD };
const orderId = process.env.E2E_PICKUP_ORDER_ID;
const ready = !!(buyer.email && buyer.password && artist.email && artist.password && orderId);
const orderShort = (orderId ?? '').slice(0, 8);

async function dismissCookies(page: Page) {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await dismissCookies(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe.serial('two-sided pickup handoff', () => {
  test.skip(!ready, 'pickup fixture not configured (E2E_PICKUP_* + artist creds) — run scripts/seed-e2e.mjs');

  let buyerContext: BrowserContext;
  let buyerPage: Page;
  let artistContext: BrowserContext;
  let artistPage: Page;

  test.beforeAll(async ({ browser }) => {
    buyerContext = await browser.newContext();
    buyerPage = await buyerContext.newPage();
    artistContext = await browser.newContext();
    artistPage = await artistContext.newPage();
  });

  test.afterAll(async () => {
    await buyerContext?.close();
    await artistContext?.close();
  });

  const buyerCard = () => buyerPage.locator('div.rounded-lg', { hasText: orderShort }).first();
  const artistCard = () => artistPage.locator('div.rounded-xl', { hasText: orderShort }).first();

  test('the order starts as an unconfirmed pickup on both sides', async () => {
    test.setTimeout(120_000);
    await login(buyerPage, buyer.email!, buyer.password!);
    await buyerPage.goto('/orders');
    await expect(buyerPage.getByRole('heading', { name: 'My Orders' })).toBeVisible({ timeout: 20_000 });
    await expect(buyerCard()).toBeVisible({ timeout: 20_000 });
    await expect(buyerCard().getByText('Paid', { exact: true })).toBeVisible();
    await expect(buyerCard().getByRole('button', { name: 'Confirm pickup handoff' })).toBeVisible();

    await login(artistPage, artist.email!, artist.password!);
    await artistPage.goto('/studio/sales');
    await expect(artistCard()).toBeVisible({ timeout: 20_000 });
    await expect(artistCard().getByText('Paid', { exact: true })).toBeVisible();
    // Protection is NOT yet earned, and the badge says exactly why.
    await artistCard().getByRole('button', { name: /not protected yet/i }).click();
    await expect(artistCard().getByText(/handoff was not confirmed by both parties/i)).toBeVisible({ timeout: 10_000 });
  });

  test('the buyer confirms alone: still paid, still unprotected, artist prompted', async () => {
    test.setTimeout(120_000);
    await buyerCard().getByRole('button', { name: 'Confirm pickup handoff' }).click();
    await expect(buyerPage.getByText(/waiting for the artist to confirm too/i).first()).toBeVisible({ timeout: 20_000 });

    // One-sided confirmation does not deliver the order and does not protect it.
    await buyerPage.reload();
    await expect(buyerCard().getByText('Paid', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(buyerCard().getByText(/you confirmed the handoff — waiting for the artist/i)).toBeVisible();
    await expect(buyerCard().getByRole('button', { name: 'Confirm pickup handoff' })).toHaveCount(0);

    await artistPage.reload();
    await expect(artistCard().getByText('Paid', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(artistCard().getByRole('button', { name: /not protected yet/i })).toBeVisible();
    await expect(artistCard().getByRole('button', { name: 'Confirm pickup handoff' })).toBeVisible();
  });

  test('the artist confirms: both sides flip to delivered and the order becomes protected', async () => {
    test.setTimeout(120_000);
    await artistCard().getByRole('button', { name: 'Confirm pickup handoff' }).click();
    await expect(artistPage.getByText(/handoff confirmed by both of you/i).first()).toBeVisible({ timeout: 20_000 });

    await artistPage.reload();
    await expect(artistCard().getByText('Delivered', { exact: true })).toBeVisible({ timeout: 20_000 });
    // The check mark is aria-hidden, so the accessible name is just "Protected".
    await expect(artistCard().getByRole('button', { name: /^Protected$/ })).toBeVisible();
    await expect(artistCard().getByRole('button', { name: 'Confirm pickup handoff' })).toHaveCount(0);

    // The buyer sees the same order state, and the confirm affordance is gone.
    await buyerPage.reload();
    await expect(buyerCard().getByText('Delivered', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(buyerCard().getByRole('button', { name: /handoff/i })).toHaveCount(0);
  });

  test('a delivered pickup order is reviewable by the buyer', async () => {
    // Delivered is the state reviews require — the pickup path has to reach
    // it or a local-pickup sale can never be reviewed.
    await expect(buyerCard().getByRole('button', { name: /leave a review/i })).toBeVisible({ timeout: 20_000 });
  });
});
