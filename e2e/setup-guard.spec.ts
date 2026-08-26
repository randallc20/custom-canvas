import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * The artist/partner setup guard.
 *
 * Registering as an artist creates the profiles row; artist_profiles is only
 * written when the setup wizard is finished, and the wizard's sole entry point
 * was the "Continue to setup" link on the post-signup screen. Anyone who
 * clicked the confirmation email in a new tab — which is everyone — signed in
 * and landed on a blank Studio with no checklist and no way forward. Partners
 * got worse: a "Pending Review" badge for an organisation never created.
 *
 * Four things have to hold, and the last two matter as much as the first two:
 * no profile is pushed into onboarding, an existing profile is NOT (the guard
 * must never lock a working artist out), and finishing the wizard lands in the
 * Studio rather than bouncing back on a stale cache.
 *
 * Fixtures (DEV, four accounts sharing one password) come from env so CI skips
 * cleanly when they don't exist. The wizard-walk test CONSUMES the no-profile
 * fixture by creating its profile row — delete that row before re-running.
 * Requires a build without NEXT_PUBLIC_TURNSTILE_SITE_KEY, or the login form is
 * captcha-gated.
 */
const PW = process.env.E2E_GUARD_PASSWORD;
const NO_PROFILE = process.env.E2E_GUARD_NO_PROFILE_EMAIL;
const HAS_PROFILE = process.env.E2E_GUARD_ARTIST_EMAIL;
const NO_GALLERY = process.env.E2E_GUARD_NO_GALLERY_EMAIL;
const HAS_GALLERY = process.env.E2E_GUARD_GALLERY_EMAIL;

test.describe('artist setup guard', () => {
  test.skip(!PW || !NO_PROFILE || !HAS_PROFILE, 'guard fixtures not configured');

  test('an artist with no profile is sent to the setup wizard', async ({ page }) => {
    await login(page, NO_PROFILE!, PW!);
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/onboarding\/artist/, { timeout: 15_000 });
    await expect(page.getByText('Basics')).toBeVisible();
  });

  test('every artist surface redirects, not just /studio', async ({ page }) => {
    await login(page, NO_PROFILE!, PW!);
    for (const path of ['/studio/work', '/studio/sales', '/listings/new']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/onboarding\/artist/, { timeout: 15_000 });
    }
  });

  test('an artist WITH a profile still reaches the Studio', async ({ page }) => {
    await login(page, HAS_PROFILE!, PW!);
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/studio$/, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/onboarding/);
    await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
  });

  test('finishing the wizard lands in the Studio and does not bounce back', async ({ page }) => {
    await login(page, NO_PROFILE!, PW!);
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/onboarding\/artist/);

    await page.getByLabel('Display Name').fill('Guard Wizard Walk');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('City').fill('Houston');
    // Deliberately NOT choosing a fulfillment preference: the empty option used
    // to fail whole-schema validation on submit, and because the offending field
    // sits on an earlier step its inline error was offscreen — "Complete Setup"
    // simply did nothing.
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /complete setup/i }).click();

    await expect(page).toHaveURL(/\/studio$/, { timeout: 20_000 });
    await expect(page.getByText(/Build your shop/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('partner setup guard', () => {
  test.skip(!PW || !NO_GALLERY || !HAS_GALLERY, 'guard fixtures not configured');

  test('a partner with no organisation is sent to the partner form', async ({ page }) => {
    await login(page, NO_GALLERY!, PW!);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding\/gallery/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Set Up Your Partner Profile/i })).toBeVisible();
  });

  test('a partner WITH an organisation still reaches the dashboard', async ({ page }) => {
    await login(page, HAS_GALLERY!, PW!);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Partner Dashboard' })).toBeVisible();
    await expect(page).not.toHaveURL(/onboarding/);
  });
});
