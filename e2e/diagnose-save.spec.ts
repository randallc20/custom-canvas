import { test, expect } from '@playwright/test';

/**
 * TEMPORARY diagnostic, not part of the suite (not in scripts/run-e2e.sh).
 *
 * `lover-social` 8.2 fails deterministically: the heart flips to Unsave, but
 * no `saved_listings` row is ever written and /saved is empty. The heart is an
 * optimistic update that rolls back on error, so the flip proves nothing —
 * this captures what the write actually answers.
 *
 * Run with the seeded env:
 *   eval "$(node scripts/seed-e2e.mjs)" && \
 *     ./node_modules/.bin/playwright test diagnose-save --project=chromium --workers=1
 */
const RUN = Date.now().toString(36);
const email = `e2e.diag.${RUN}@customcanvas.dev`;
const password = `Diag-${RUN}-pass`;

test('capture what the save write actually answers', async ({ page }) => {
  test.setTimeout(120_000);

  const console_errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console_errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console_errors.push(`[pageerror] ${e.message}`));

  // Every Supabase REST call, with its status and body when it is not 2xx.
  const rest: string[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('/rest/v1/')) return;
    let body = '';
    if (res.status() >= 300) body = (await res.text().catch(() => '')).slice(0, 400);
    rest.push(`${res.status()} ${res.request().method()} ${url.replace(/^.*\/rest\/v1\//, '')} ${body}`);
  });

  await page.goto('/register');
  await page.getByRole('button', { name: 'Accept', exact: true }).click().catch(() => {});
  await page.getByLabel('Full Name').fill('Diag Lover');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Art Lover' }).click();
  await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).not.toHaveURL(/\/register/, { timeout: 20_000 });

  await page.goto('/');
  const heart = page.locator('#feed button[aria-label="Save"]').first();
  await heart.waitFor({ state: 'visible', timeout: 20_000 });

  const card = page.locator('#feed a[href^="/listing/"]').filter({ has: page.locator('button[aria-label="Save"]') }).first();
  const href = await card.getAttribute('href');
  const pinned = page.locator(`#feed a[href="${href}"]`).first();
  const title = (await pinned.locator('h3').first().innerText()).trim();

  rest.length = 0;
  await pinned.locator('button[aria-label="Save"]').first().click();

  // Give the write time to answer AND to roll back if it failed.
  await page.waitForTimeout(6000);

  const stillSaved = await pinned.locator('button[aria-label="Unsave"]').count();
  const toast = await page.locator('[role="status"], .fixed.bottom-4').innerText().catch(() => '');

  console.log('\n================ DIAGNOSTIC ================');
  console.log('listing:', href, '/', title);
  console.log('heart still shows Unsave after 6s:', stillSaved > 0);
  console.log('toast text:', JSON.stringify(toast));
  console.log('--- REST calls after the click ---');
  for (const r of rest) console.log('  ', r);
  console.log('--- console errors ---');
  for (const c of console_errors.slice(-25)) console.log('  ', c);
  console.log('============================================\n');

  await page.goto('/saved');
  const savedBody = await page.locator('main, body').first().innerText();
  console.log('/saved contains the title:', savedBody.includes(title));
  console.log('/saved text (first 300):', savedBody.slice(0, 300).replace(/\n+/g, ' | '));
});
