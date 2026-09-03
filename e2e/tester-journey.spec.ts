import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Physical retrace of tester round 1 (2026-08-26): every issue the tester hit,
 * walked in a real browser. Serial — each step depends on the last. Creates a
 * FRESH artist through the real register form each run (DEV/staging has
 * autoconfirm on, so signup lands straight in onboarding — the same landing a
 * prod user reaches by clicking their confirmation link).
 *
 * Requires an admin fixture:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * and two generated images:
 *   E2E_SMALL_IMAGE (a tiny png, for the avatar)
 *   E2E_BIG_IMAGE   (an over-5MB png — proves in-browser downscale)
 *
 * Covers, in tester order:
 *  1. register → onboarding directly, no dead "Check Your Email" screen
 *  2. onboarding wizard completes → Studio with setup checklist
 *  3. profile save succeeds with Status left untouched (the '' enum trap)
 *  4. avatar upload; story saved
 *  5. listing created with dimensions in INCHES and an oversized photo
 *  6. artist + listing NOT publicly visible; NotLiveNotice explains why
 *  7. admin sees the artist under "Not submitted yet" (not a mystery)
 *  8. artist submits for review
 *  9. admin approves from the queue
 * 10. artist + listing publicly visible; dimensions show in + cm
 * 11. expired confirmation links tell the truth on /login
 */

const admin = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const smallImage = process.env.E2E_SMALL_IMAGE;
const bigImage = process.env.E2E_BIG_IMAGE;
const ready = !!(admin.email && admin.password && smallImage && bigImage);

const RUN = Date.now().toString(36);
const artistEmail = `e2e.rt1.${RUN}@customcanvas.dev`;
const artistPassword = `Rt1-${RUN}-pass`;
const displayName = `RT1 Artist ${RUN}`;
const listingTitle = `RT1 Bayou Nocturne ${RUN}`;

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe.serial('tester round 1 journey', () => {
  test.skip(!ready, 'admin creds + generated images not configured');

  let artistContext: BrowserContext;
  let artistPage: Page;
  let artistSlug: string;
  let listingUrl: string;

  test.beforeAll(async ({ browser }) => {
    artistContext = await browser.newContext();
    artistPage = await artistContext.newPage();
  });
  test.afterAll(async () => {
    await artistContext?.close();
  });

  test('register lands in onboarding, not a dead confirmation screen', async () => {
    const page = artistPage;
    await page.goto('/register');
    // The fixed cookie banner overlays bottom-of-page buttons on mobile
    // viewports — dismiss it the way a person does.
    const cookie = page.getByRole('button', { name: 'Accept' });
    if (await cookie.isVisible().catch(() => false)) await cookie.click();
    await page.getByLabel('Full Name').fill(displayName);
    await page.getByLabel('Email').fill(artistEmail);
    await page.getByLabel('Password').fill(artistPassword);
    await page.getByRole('button', { name: 'Artist' }).click();
    await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();
    // Autoconfirm target: a session came back, so the app must go straight to
    // setup — the old flow parked everyone on "Check Your Email".
    await expect(page).toHaveURL(/\/onboarding\/artist/, { timeout: 20_000 });
    // The post-signup hydration race regression: the page must NOT bounce to
    // /login while AuthContext catches up.
    await expect(page.getByLabel('Display Name')).toBeVisible({ timeout: 20_000 });
  });

  test('onboarding wizard completes into the Studio', async () => {
    const page = artistPage;
    await page.getByLabel('Display Name').fill(displayName);
    // The wizard's big textarea is Your Story (round 2: the old bio field's
    // text was invisible everywhere the tester looked — "it deleted my story").
    // Keep it under 100 chars so the checklist's story row stays unticked.
    await page.locator('textarea').fill('Wizard story draft — replaced on the profile page.');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('City').fill('Houston');
    await page.locator('select').selectOption('ships_national');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText(/I agree to the Custom Canvas Artist Agreement/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /complete setup/i }).click();
    await expect(page).toHaveURL(/\/studio/, { timeout: 20_000 });
    await expect(page.getByText(/build your shop, then submit/i)).toBeVisible({ timeout: 15_000 });
  });

  test('profile saves with Status untouched, story + avatar added', async () => {
    const page = artistPage;
    await page.goto('/studio/page');
    const storyBox = page.locator('fieldset', { hasText: 'Your Story' }).locator('textarea');
    await storyBox.waitFor({ state: 'visible', timeout: 15_000 });
    // The story written in the signup wizard must arrive here — this is the
    // round-2 defect (wizard text landed in the invisible bio column).
    await expect(storyBox).toHaveValue(/Wizard story draft/);
    await storyBox.fill(
      'I paint the bayous at dusk — slow water, sodium light, herons that refuse to be hurried. This shop exists so the e2e suite can walk the whole tester journey for real.'
    );
    // Deliberately DO NOT touch the Status dropdown: the tester's save failures
    // included the untouched-select-fails-the-enum trap.
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/failed to update profile/i)).toHaveCount(0);

    // Avatar: the first file input on the page belongs to the avatar uploader.
    await page.locator('input[type=file]').first().setInputFiles(smallImage!);
    await expect(page.getByText(/profile photo updated/i)).toBeVisible({ timeout: 30_000 });

    // Grab the public slug for the anon checks later.
    const preview = await page.getByRole('link', { name: /preview as visitor/i }).getAttribute('href');
    artistSlug = preview!.match(/\/artist\/([^?]+)/)![1];
    expect(artistSlug).toBeTruthy();
  });

  test('listing created with inches + an over-5MB photo (auto-downscale)', async () => {
    const page = artistPage;
    await page.goto('/listings/new');
    // The not-public banner must be visible right where work is created.
    await expect(page.getByText(/only you can see your work right now/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Title').fill(listingTitle);
    await page.getByLabel('Medium').fill('Oil on panel');
    // Inches are the default — the toggle must say "in" is active.
    await expect(page.getByRole('button', { name: 'in', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Width (in)').fill('24');
    await page.getByLabel('Height (in)').fill('36');
    await page.getByLabel('Price ($)').fill('180');

    // The oversized photo: the old build rejected this outright.
    await page.locator('input[type=file]').setInputFiles(bigImage!);
    await expect(page.locator('img[alt="Listing image"]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/is over .*MB/i)).toHaveCount(0);
    await expect(page.getByText(/couldn't be resized/i)).toHaveCount(0);

    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });
    await expect(page.getByText(/only you can see your work right now/i)).toBeVisible();
    await expect(page.getByText(listingTitle)).toBeVisible({ timeout: 15_000 });
  });

  test('anonymous visitors cannot see the draft artist', async ({ browser }) => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/artist/${artistSlug}`);
    await expect(page.getByText(displayName)).toHaveCount(0);
    await anon.close();
  });

  test('admin sees the artist under "Not submitted yet" before submission', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, admin.email!, admin.password!);
    await page.goto('/admin/applications');
    const section = page.locator('div', { has: page.getByRole('heading', { name: /not submitted yet/i }) }).last();
    await expect(section.getByText(displayName)).toBeVisible({ timeout: 15_000 });
    await expect(section.getByText(/building their shop/i).first()).toBeVisible();
    await ctx.close();
  });

  test('artist submits for review', async () => {
    const page = artistPage;
    await page.goto('/studio');
    const submit = page.getByRole('button', { name: /submit for review/i });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    await expect(page.getByText(/your shop is in review/i)).toBeVisible({ timeout: 15_000 });
  });

  test('admin approves from the applications queue', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, admin.email!, admin.password!);
    await page.goto('/admin/applications');
    const card = page.locator('div.rounded-xl', { hasText: displayName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(page.getByText(/approved — now live/i)).toBeVisible({ timeout: 15_000 });

    // The admin listings view must call the listing public now.
    await page.goto('/admin/listings');
    const row = page.locator('tr', { hasText: listingTitle });
    await expect(row.getByText('public', { exact: true })).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });

  test('artist and listing are publicly visible, dimensions in inches + cm', async ({ browser }) => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/artist/${artistSlug}`);
    await expect(page.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
    await page.getByText(listingTitle).first().click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 15_000 });
    listingUrl = page.url();
    // 24 × 36 in (61 × 91.4 cm)
    await expect(page.getByText(/Dimensions: 24 × 36 in \(61 × 91\.4 cm\)/)).toBeVisible({ timeout: 15_000 });
    await anon.close();
  });

  test('expired confirmation links tell the truth on /login', async ({ browser }) => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto('/auth/callback?next=/studio');
    await expect(page).toHaveURL(/\/login\?confirm_error=1/, { timeout: 15_000 });
    await expect(page.getByText(/no longer valid/i)).toBeVisible();
    await anon.close();
  });
});
