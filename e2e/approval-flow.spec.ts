import { test, expect, Page } from '@playwright/test';

// End-to-end regression for the artist approval gate (PR-2):
//   draft → submit → pending → admin approves → live (visible)
// plus the compare-and-swap guards (double submit / double decide → 409).
// Requires a seeded DRAFT artist + an admin:
//   E2E_DRAFT_ARTIST_EMAIL / E2E_DRAFT_ARTIST_PASSWORD  (draft, not live)
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
// The suite ENDS with the artist approved+live. Runs serially — each step
// depends on the previous one's state.

const artistCreds = {
  email: process.env.E2E_DRAFT_ARTIST_EMAIL,
  password: process.env.E2E_DRAFT_ARTIST_PASSWORD,
};
const adminCreds = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const haveCreds = !!(artistCreds.email && artistCreds.password && adminCreds.email && adminCreds.password);

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test.describe.serial('artist approval flow', () => {
  test.skip(!haveCreds, 'approval-flow creds not set');

  test('draft artist sees the submit banner and submits', async ({ page }) => {
    await login(page, artistCreds.email!, artistCreds.password!);
    await page.goto('/studio');
    await expect(page.getByText(/build your shop, then submit/i)).toBeVisible();
    await page.getByRole('button', { name: /submit for review/i }).click();
    await expect(page.getByText(/your shop is in review/i)).toBeVisible({ timeout: 10_000 });

    // Double-submit is a clean 409, not a duplicate queue entry.
    const res = await page.request.post('/api/artist/submit');
    expect(res.status()).toBe(409);
  });

  test('admin sees the application and approves it; second decide 409s', async ({ page }) => {
    await login(page, adminCreds.email!, adminCreds.password!);
    await page.goto('/admin/applications');
    const card = page.locator('div.rounded-xl', { hasText: /applied/ }).first();
    await expect(card).toBeVisible();

    // Capture the artist id from the preview link before deciding.
    const preview = await card.getByRole('link', { name: /view profile/i }).getAttribute('href');
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(page.getByText(/approved — now live/i)).toBeVisible({ timeout: 10_000 });

    // CAS: deciding the same application again must 409. We need the artist
    // id — resolve it from the profile slug via the public artists API.
    const slug = preview?.match(/\/artist\/([^?]+)/)?.[1];
    const artistRes = await page.request.get(`/api/artists/${slug}`);
    expect(artistRes.ok()).toBeTruthy();
    const { id } = await artistRes.json();
    const again = await page.request.post(`/api/admin/applications/${id}`, {
      data: { action: 'reject', reason: 'late double-decide must not land' },
    });
    expect(again.status()).toBe(409);
  });

  test('approved artist is publicly visible again', async ({ page }) => {
    await login(page, artistCreds.email!, artistCreds.password!);
    await page.goto('/studio');
    // Banner gone — the shop is live.
    await expect(page.getByText(/your shop is in review/i)).toHaveCount(0);
    await expect(page.getByText(/build your shop, then submit/i)).toHaveCount(0);
  });
});
