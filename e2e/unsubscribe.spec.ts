import { test, expect, Page } from '@playwright/test';

/**
 * The one-click unsubscribe link (R11 / 05-P3 "tests", item 7 — `/unsubscribe`
 * is named there as having no coverage).
 *
 * CAN-SPAM: every optional email carries `/unsubscribe?token=<profile's
 * unsubscribe_token>`. The page POSTs to /api/unsubscribe, which looks the
 * token up with the service-role client (no session — the recipient may not
 * be signed in, or may not have an account open) and turns every optional
 * category off. `unsubscribe_token` is service-role-only (00031) and frozen
 * against owner writes (00052), so only the seeder can hand it to a spec.
 *
 * Requires (from scripts/seed-e2e.mjs):
 *   E2E_UNSUB_EMAIL / E2E_UNSUB_PASSWORD — a throwaway Art Lover whose four
 *     email categories the seeder has just set back ON
 *   E2E_UNSUB_TOKEN — that profile's unsubscribe_token
 *
 * The fixture is consumed: it ends unsubscribed. The seeder re-arms it (and
 * deletes the account) on the next run.
 */

const unsub = {
  email: process.env.E2E_UNSUB_EMAIL,
  password: process.env.E2E_UNSUB_PASSWORD,
  token: process.env.E2E_UNSUB_TOKEN,
};
const ready = !!(unsub.email && unsub.password && unsub.token);

const CATEGORIES = [
  'Email me when I get a new message',
  'New work from artists I follow',
  'Price drops on art I saved',
  'Product news & occasional updates',
];

async function dismissCookies(page: Page) {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

const categoryBox = (page: Page, label: string) =>
  page.locator('label', { hasText: label }).locator('input[type=checkbox]').first();

test.describe.serial('/unsubscribe', () => {
  test.skip(!ready, 'unsubscribe fixture not configured (E2E_UNSUB_*) — run scripts/seed-e2e.mjs');

  test('a link with no token, and one with a token nobody holds, both refuse', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/unsubscribe');
    await dismissCookies(page);
    await expect(page.getByText(/this unsubscribe link is invalid or expired/i)).toBeVisible({ timeout: 20_000 });

    // A well-formed UUID that matches no profile: 404 from the route, same
    // copy — and nothing may be said about whose address it was.
    await page.goto('/unsubscribe?token=00000000-0000-0000-0000-000000000000');
    await expect(page.getByText(/this unsubscribe link is invalid or expired/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/you.?re unsubscribed/i)).toHaveCount(0);
  });

  test('the fixture starts with every category on', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/login');
    await dismissCookies(page);
    await page.getByLabel('Email').fill(unsub.email!);
    await page.getByLabel('Password').fill(unsub.password!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Email Preferences' })).toBeVisible({ timeout: 20_000 });
    for (const label of CATEGORIES) {
      await expect(categoryBox(page, label)).toBeChecked();
    }
  });

  test('the token link marks the preference — signed out, in one click', async ({ browser }) => {
    test.setTimeout(90_000);
    // A fresh context on purpose: the link arrives in an email client, with
    // no Custom Canvas session behind it.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/unsubscribe?token=${unsub.token}`);
    await dismissCookies(page);
    await expect(page.getByRole('heading', { name: /you.?re unsubscribed/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/won.?t receive non-essential emails/i)).toBeVisible();
    // The way back is offered, not assumed.
    await expect(page.getByRole('link', { name: /email preferences/i })).toHaveAttribute('href', '/account');

    // Idempotent: the same link again is still a success, not an error.
    await page.goto(`/unsubscribe?token=${unsub.token}`);
    await expect(page.getByRole('heading', { name: /you.?re unsubscribed/i })).toBeVisible({ timeout: 20_000 });
    await context.close();
  });

  test('the account page shows all four categories off afterwards', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/login');
    await dismissCookies(page);
    await page.getByLabel('Email').fill(unsub.email!);
    await page.getByLabel('Password').fill(unsub.password!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });

    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Email Preferences' })).toBeVisible({ timeout: 20_000 });
    for (const label of CATEGORIES) {
      await expect(categoryBox(page, label), `${label} is still on`).not.toBeChecked();
    }
    // Transactional mail is not part of the bargain, and the page says so.
    await expect(page.getByText(/purchase and payout emails are always sent/i)).toBeVisible();

    // And the categories can be turned back on from here — the unsubscribe is
    // a preference, not a tombstone.
    await categoryBox(page, CATEGORIES[0]).check();
    await page.getByRole('button', { name: /save preferences/i }).click();
    await expect(page.getByText(/email preferences saved/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
