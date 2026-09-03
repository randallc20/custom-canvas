import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * L2 / ruling D11 — re-acceptance of the counsel document set.
 *
 * Terms of Service v2.0 added arbitration and a class-action waiver, which
 * §17 makes material, so every existing account is asked again on its next
 * signed-in visit. This walks the account that has accepted nothing:
 *
 *   1. the interstitial appears, names the documents and their versions,
 *      and links the full text
 *   2. the accept button stays disabled until the box is ticked
 *   3. "Not now" leaves browsing open and drops the standing banner
 *   4. a gated write is refused server-side while it is outstanding —
 *      the enforcement half, which no amount of client-side dismissal
 *      should get past
 *   5. accepting clears the interstitial, the banner, and the refusal, and
 *      it stays cleared across a reload (the record is on the row, not in
 *      the tab)
 *
 * Fixture: E2E_STALE_TERMS_EMAIL from scripts/seed-e2e.mjs — an Art Lover
 * whose acceptance columns are deliberately NULL. Every other fixture is
 * stamped current by the seeder so this dialog does not land on top of the
 * rest of the suite.
 *
 * The spec CONSUMES its fixture: step 5 stamps the account, so a re-run needs
 * a fresh seed (same contract as the approval-flow and guard specs).
 */

const creds = process.env.E2E_STALE_TERMS_EMAIL && process.env.E2E_STALE_TERMS_PASSWORD
  ? { email: process.env.E2E_STALE_TERMS_EMAIL, password: process.env.E2E_STALE_TERMS_PASSWORD }
  : null;

test.describe('acceptance interstitial (L2, D11)', () => {
  test.skip(!creds, 'E2E_STALE_TERMS_EMAIL/PASSWORD not set — run through scripts/run-e2e.sh');

  test('a stale account is asked, can defer, is refused a gated write, then accepts', async ({ page }) => {
    await login(page, creds!.email, creds!.password);

    // --- 1. the interstitial appears, unprompted -----------------------
    const dialog = page.getByRole('dialog', { name: /updated our terms/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // A buyer is asked for the Terms of Service and the Terms of Sale — not
    // the Artist Agreement.
    await expect(dialog.getByRole('heading', { name: /Terms of Service · version 2\.0/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Terms of Sale · version 2\.0/ })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Artist Agreement/ })).toHaveCount(0);

    // The arbitration change is the reason this dialog exists; it must say so.
    await expect(dialog.getByText(/arbitration/i).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Read the full Terms of Service/i })).toHaveAttribute('href', '/terms');

    // --- 2. the accept button is gated on the checkbox ------------------
    const accept = dialog.getByRole('button', { name: /accept and continue/i });
    await expect(accept).toBeDisabled();
    const box = dialog.getByRole('checkbox');
    // Specific: the Terms of Service summary ALSO mentions being 18 or older
    // (§2), so a loose match hits two elements.
    await expect(dialog.getByText(/I am 18 or older and I agree/i)).toBeVisible();

    // --- 3. deferring leaves browsing open ------------------------------
    await dialog.getByRole('button', { name: /not now/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: /review now/i })).toBeVisible();

    // Browsing genuinely still works.
    await page.goto('/');
    await expect(page.getByRole('button', { name: /review now/i })).toBeVisible({ timeout: 15_000 });

    // --- 4. the server refuses a gated write ----------------------------
    // Straight at the API: the point is that enforcement does not depend on
    // the browser having rendered anything.
    const refused = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000', rating: 5, comment: 'x' }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    expect(refused.status).toBe(403);
    expect(refused.body?.code).toBe('acceptance_required');

    // --- 5. accepting clears it, and it stays cleared --------------------
    await page.getByRole('button', { name: /review now/i }).click();
    await expect(dialog).toBeVisible();
    await box.check();
    await expect(accept).toBeEnabled();
    await accept.click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /review now/i })).toHaveCount(0);

    // The record is on the row, not in the tab.
    await page.reload();
    await expect(page.getByRole('button', { name: /review now/i })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('dialog', { name: /updated our terms/i })).toHaveCount(0);

    // And the gated write is no longer refused for acceptance. (It is still
    // refused — that order id does not exist — just not for this reason.)
    const after = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000', rating: 5, comment: 'x' }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    expect(after.body?.code).not.toBe('acceptance_required');
  });
});
