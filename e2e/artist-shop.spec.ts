import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { login } from './helpers/auth';

/**
 * Artist shop-building, reject → resubmit → approve, and going-live — the
 * LIVE-TEST-PLAN sections AROUND the happy path that tester-journey.spec.ts
 * already walks (4.7–4.19, 5.5/5.6, 6.1–6.14). One fresh artist is created
 * through the real register form + onboarding wizard (DEV/staging autoconfirm
 * lands signup straight in /onboarding/artist), then built up, rejected with
 * a reason, resubmitted, approved, and operated as a live shop.
 *
 * Requires:
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD  — admin fixture account
 *   E2E_SMALL_IMAGE                       — a small png (avatar/photos)
 *
 * Deliberately NOT covered here (see plan):
 *  - deep public-visibility checks pre-approval (journey covers them)
 *  - rejection/approval emails (no mail sink against staging)
 *  - completing Stripe Express onboarding (we only assert the handoff to
 *    connect.stripe.com and that the app survives coming back)
 */

const admin = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const smallImage = process.env.E2E_SMALL_IMAGE;
const ready = !!(admin.email && admin.password && smallImage);

const RUN = Date.now().toString(36);
const artistEmail = `e2e.shop.${RUN}@customcanvas.dev`;
const artistPassword = `Shop-${RUN}-pass`;
const displayName = `Shop Artist ${RUN}`;
const montroseTitle = `Morning in Montrose ${RUN}`;
const bayouTitle = `Bayou Study ${RUN}`;
const seriesName = `Bayou Works ${RUN}`;
const rejectReason = 'Please add at least one more photo to your second listing.';

// A >5MB non-image: the uploader's downscale path cannot decode it, so it must
// fail with the friendly "couldn't be resized" copy rather than crash or hang.
const notAnImagePath = path.join(os.tmpdir(), `e2e-not-an-image-${RUN}.txt`);

async function acceptCookies(page: Page) {
  const cookie = page.getByRole('button', { name: 'Accept' });
  if (await cookie.isVisible().catch(() => false)) await cookie.click();
}

async function newAdminPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/login');
  await acceptCookies(page);
  await login(page, admin.email!, admin.password!);
  return { ctx, page };
}

test.describe.serial('artist shop building, reject → resubmit → approve, going live', () => {
  test.skip(!ready, 'admin creds + E2E_SMALL_IMAGE not configured');

  let artistContext: BrowserContext;
  let artistPage: Page;
  let artistSlug: string;

  test.beforeAll(async ({ browser }) => {
    fs.writeFileSync(notAnImagePath, Buffer.alloc(Math.ceil(5.5 * 1024 * 1024), 0x61));
    artistContext = await browser.newContext();
    artistPage = await artistContext.newPage();
  });
  test.afterAll(async () => {
    await artistContext?.close();
    fs.rmSync(notAnImagePath, { force: true });
  });

  // ── Setup (happy path detail lives in tester-journey.spec.ts) ─────────────

  test('setup: register a fresh artist — autoconfirm lands in onboarding', async () => {
    const page = artistPage;
    await page.goto('/register');
    await acceptCookies(page);
    await page.getByLabel('Full Name').fill(displayName);
    await page.getByLabel('Email').fill(artistEmail);
    await page.getByLabel('Password').fill(artistPassword);
    await page.getByRole('button', { name: 'Artist' }).click();
    await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/onboarding\/artist/, { timeout: 20_000 });
    await expect(page.getByLabel('Display Name')).toBeVisible({ timeout: 20_000 });
  });

  test('setup: onboarding wizard completes into the Studio', async () => {
    const page = artistPage;
    await page.getByLabel('Display Name').fill(displayName);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('City').fill('Houston');
    await page.locator('select').selectOption('ships_national');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText(/I agree to the Custom Canvas Artist Agreement/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /complete setup/i }).click();
    await expect(page).toHaveURL(/\/studio/, { timeout: 20_000 });
  });

  // ── 4.7 / 4.8 — the setup checklist gates submission ──────────────────────

  test('4.7/4.8: checklist rows show; Submit for review is disabled with a hint', async () => {
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Build your shop, then submit it for review')).toBeVisible({ timeout: 15_000 });
    // Progress counter out of 8.
    await expect(page.getByText(/^\d\/8$/)).toBeVisible();
    for (const row of [
      'Add a profile photo',
      'Tell your story (100+ characters)',
      'Pick your mediums',
      'Set your neighborhood',
      'Choose shipping or pickup',
      'Add a banner image',
      'Create your first listing — aim for 3+ photos',
      'Connect Stripe so you can get paid',
    ]) {
      await expect(page.getByText(row, { exact: true })).toBeVisible();
    }
    // 4.8: an empty shop cannot be submitted, and the gate explains itself.
    const submit = page.getByRole('button', { name: /submit for review/i });
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText('To submit: profile photo, your story, and at least one listing.')
    ).toBeVisible();
    // A checklist row is a deep link to the right page.
    await page.getByRole('link', { name: /Add a profile photo/ }).click();
    await expect(page).toHaveURL(/\/studio\/page/, { timeout: 15_000 });
  });

  // ── 4.9 — fill in the public page ─────────────────────────────────────────

  test('4.9: public page — avatar, story, statement, influences, mediums, neighborhood, fulfillment', async () => {
    test.setTimeout(120_000);
    const page = artistPage;
    await page.goto('/studio/page');

    // Profile photo (essential for submission). First file input = avatar.
    await page.locator('input[type=file]').first().setInputFiles(smallImage!);
    await expect(page.getByText(/profile photo updated/i)).toBeVisible({ timeout: 30_000 });

    const storyBox = page.locator('fieldset', { hasText: 'Your Story' }).locator('textarea');
    await storyBox.waitFor({ state: 'visible', timeout: 15_000 });
    await storyBox.fill(
      'I paint slow water and sodium light — the bayous at dusk, herons that refuse to be hurried, ' +
      'and the neighborhoods that grew up around them. This shop exists so the e2e suite can walk ' +
      'the whole shop-building journey for real, end to end.'
    );
    await page
      .locator('fieldset', { hasText: 'About Your Work' })
      .locator('textarea')
      .fill('I work wet-into-wet, chasing the moment the light goes.');
    await page.getByLabel('Influences').fill('Rackstraw Downes, Julie Mehretu');
    await page.getByRole('button', { name: 'Oil Paint', exact: true }).click();
    await page.getByRole('button', { name: 'Ink', exact: true }).click();
    await page.getByLabel('Neighborhood').fill('Montrose');
    await page
      .locator('label:has-text("Fulfillment Preference") + select')
      .selectOption('ships_national');

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 15_000 });

    // Public slug for the anon checks later.
    const preview = await page.getByRole('link', { name: /preview as visitor/i }).getAttribute('href');
    artistSlug = preview!.match(/\/artist\/([^?]+)/)![1];
    expect(artistSlug).toBeTruthy();
  });

  // ── 4.10 — uploader abuse ─────────────────────────────────────────────────

  test('4.10: a non-image file is rejected gracefully, not a crash', async () => {
    test.setTimeout(90_000);
    const page = artistPage;
    await page.goto('/studio/page');
    const photosFieldset = page.locator('fieldset', { hasText: 'Meet the Artist' });
    await photosFieldset.locator('input[type=file]').setInputFiles(notAnImagePath);
    // Over the 5MB cap the uploader tries an in-browser downscale; a text file
    // can't be decoded, so the friendly failure copy must appear.
    await expect(photosFieldset.getByText(/couldn't be resized to fit under 5MB/)).toBeVisible({
      timeout: 30_000,
    });
    // The page is still alive and editable.
    await expect(page.getByRole('button', { name: /save changes/i })).toBeVisible();
  });

  // ── 4.11 / 4.12 / 4.13 — education, personal photo, accent colour ─────────

  test('4.11–4.13: education entry, personal photo, accent colour all save', async () => {
    test.setTimeout(120_000);
    const page = artistPage;
    await page.goto('/studio/page');

    // 4.11 education (Glassell — Part 12 depends on this exact school name).
    const education = page.locator('fieldset', { hasText: 'Education & Training' });
    await education.getByRole('button', { name: 'Add education' }).click();
    await education.getByLabel('School / Program name').fill('Glassell School of Art');
    await education.getByLabel('Start year').fill('2020');
    await education.getByLabel('End year').fill('2024');

    // 4.12 personal photo.
    const photos = page.locator('fieldset', { hasText: 'Meet the Artist' });
    await photos.locator('input[type=file]').setInputFiles(smallImage!);
    await expect(photos.locator('input[placeholder="Add a caption…"]')).toBeVisible({ timeout: 30_000 });
    await expect(photos.getByText(/1\/10 photos/)).toBeVisible();

    // 4.13 accent colour.
    await page.getByRole('button', { name: 'Accent color #356A8C' }).click();

    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 15_000 });
  });

  // ── 4.14 / 4.15 / 4.16 — first listing: AI disclosure gate, draft first ───

  test('4.14/4.15: create listing — AI "assisted" demands a real disclosure', async () => {
    test.setTimeout(180_000);
    const page = artistPage;
    await page.goto('/listings/new');
    await expect(page.getByText(/only you can see your work right now/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('Title').fill(montroseTitle);
    await page.locator('textarea').first().fill(
      'Oil on stretched canvas, painted from the Westheimer curve just after sunrise. Edges are ' +
      'painted and it hangs without a frame; varnished, signed on the back, ready to ship the ' +
      'week it sells.'
    );
    await page.getByLabel('Medium').fill('Oil on canvas');
    // L4: condition is a required Listing Standards field.
    await page.getByLabel('Condition').fill('New, no damage.');
    await page.getByLabel('Width (in)').fill('24');
    await page.getByLabel('Height (in)').fill('36');
    await page.getByLabel('Year Created').fill('2026');
    await page.getByLabel('Price ($)').fill('20');
    await page.getByLabel('Shipping rate ($)').fill('5');

    // Tags are DB-seeded chips (the picker renders nothing when the tags table
    // is empty) — pick a couple when it rendered. The helper text sits in the
    // picker's header; two hops up is the whole TagPicker, whose only buttons
    // are the chips.
    const tagChips = page
      .getByText(/help buyers find this piece/)
      .locator('xpath=../..')
      .locator('button');
    if ((await tagChips.count()) > 1) {
      await tagChips.nth(0).click();
      await tagChips.nth(1).click();
    }

    // Three photos (checklist row asks for 3+).
    await page
      .locator('fieldset', { hasText: 'Images' })
      .locator('input[type=file]')
      .setInputFiles([smallImage!, smallImage!, smallImage!]);
    await expect(page.getByText(/3\/8 images/)).toBeVisible({ timeout: 90_000 });

    // 4.15 — the "How it was made" gate.
    await page.getByRole('radio', { name: /generative tool was part of my process/i }).check();
    const disclosure = page.getByLabel('What did you contribute?');
    await expect(disclosure).toBeVisible();
    await disclosure.fill('AI');
    await page.getByRole('button', { name: /save as draft/i }).click();
    await expect(
      page.getByText('Please describe your contribution in at least 20 characters.')
    ).toBeVisible({ timeout: 15_000 });
    // Switching back to "none" removes the box entirely…
    await page.getByRole('radio', { name: /no generative ai was used/i }).check();
    await expect(disclosure).toBeHidden();
    // …and a real disclosure passes.
    await page.getByRole('radio', { name: /generative tool was part of my process/i }).check();
    await page
      .getByLabel('What did you contribute?')
      .fill('Generated a colour study reference, then painted the final work entirely in oil.');

    // 4.16 — save as draft, land in Work with a draft marker.
    await page.getByRole('button', { name: /save as draft/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });
    const row = page.locator('div.rounded-xl', { hasText: montroseTitle }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText('draft', { exact: true })).toBeVisible();
  });

  test('4.16: publishing the draft clears the draft marker', async () => {
    const page = artistPage;
    await page.goto('/studio/work');
    const row = page.locator('div.rounded-xl', { hasText: montroseTitle }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(row.getByText('available', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText('draft', { exact: true })).toHaveCount(0);
  });

  // ── 4.17 — the deliberately sloppy second listing ─────────────────────────

  test('4.17: second listing — one photo, one-line description, published', async () => {
    test.setTimeout(120_000);
    const page = artistPage;
    await page.goto('/listings/new');
    await page.getByLabel('Title').fill(bayouTitle);
    await page.locator('textarea').first().fill('Quick gouache study of Buffalo Bayou.');
    await page.getByLabel('Medium').fill('Gouache');
    // L4: condition is a required Listing Standards field.
    await page.getByLabel('Condition').fill('New, no damage.');
    await page.getByLabel('Price ($)').fill('8');
    await page.getByLabel('Shipping rate ($)').fill('0');
    await page
      .locator('fieldset', { hasText: 'Images' })
      .locator('input[type=file]')
      .setInputFiles(smallImage!);
    await expect(page.getByText(/1\/8 images/)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });
    await expect(
      page.locator('div.rounded-xl', { hasText: bayouTitle }).first().getByText('available', { exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── 4.18 — nothing public yet (light; journey covers the anon walk) ───────

  test('4.18: the not-live banner explains the shop is invisible', async () => {
    const page = artistPage;
    await page.goto('/studio/work');
    await expect(page.getByText(/only you can see your work right now/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/hasn.t been submitted for review yet/i)).toBeVisible();
  });

  // ── 4.19 — submit for review ──────────────────────────────────────────────

  test('4.19: Submit for review is now enabled; submitting can only happen once', async () => {
    const page = artistPage;
    await page.goto('/studio');
    const submit = page.getByRole('button', { name: /submit for review/i });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    await expect(page.getByText(/your shop is in review/i)).toBeVisible({ timeout: 15_000 });
    // The checklist (and its submit button) is gone — no double submission.
    await expect(page.getByRole('button', { name: /submit for review/i })).toHaveCount(0);
  });

  // ── 5.5 — admin rejects first, on purpose ─────────────────────────────────

  test('5.5: admin rejects with a required, artist-visible reason', async ({ browser }) => {
    const { ctx, page } = await newAdminPage(browser);
    await page.goto('/admin/applications');
    const card = page.locator('div.rounded-xl', { hasText: displayName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Reject', exact: true }).click();
    const reasonBox = card.locator('textarea');
    await expect(reasonBox).toBeVisible();
    await expect(reasonBox).toHaveAttribute('placeholder', /the artist sees this/);
    // Empty reason cannot be sent.
    await expect(card.getByRole('button', { name: /send rejection/i })).toBeDisabled();
    await reasonBox.fill(rejectReason);
    await card.getByRole('button', { name: /send rejection/i }).click();
    await expect(page.getByText(/application rejected/i)).toBeVisible({ timeout: 15_000 });
    // She leaves the queue and reappears under "Not submitted yet" as
    // changes-requested.
    await expect(page.locator('div.rounded-xl', { hasText: displayName })).toHaveCount(0);
    const table = page.locator('table', { hasText: displayName });
    await expect(table.locator('tr', { hasText: displayName }).getByText('changes requested')).toBeVisible({
      timeout: 15_000,
    });
    await ctx.close();
  });

  // ── 6.1 / 6.2 — the artist sees the exact reason and resubmits ────────────

  test('6.1/6.2: rejection banner shows the admin\'s exact words; resubmit works', async () => {
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Your application needs a few changes')).toBeVisible({ timeout: 15_000 });
    // The exact sentence the admin typed, word for word.
    await expect(page.getByText(rejectReason)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Address the feedback, then resubmit for review')).toBeVisible();
    const resubmit = page.getByRole('button', { name: /resubmit for review/i });
    await expect(resubmit).toBeEnabled({ timeout: 15_000 });
    await resubmit.click();
    await expect(page.getByText(/your shop is in review/i)).toBeVisible({ timeout: 15_000 });
  });

  // ── 5.6 — admin approves the resubmission ─────────────────────────────────

  test('5.6: admin approves the resubmission', async ({ browser }) => {
    const { ctx, page } = await newAdminPage(browser);
    await page.goto('/admin/applications');
    const card = page.locator('div.rounded-xl', { hasText: displayName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: /approve/i }).click();
    await expect(page.getByText(/approved — now live/i)).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });

  // ── 6.3 / 6.4 — live: checklist gone, shop public ─────────────────────────

  test('6.3/6.4: artist is live — checklist gone, page publicly visible', async ({ browser }) => {
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Profile Completeness')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Build your shop, then submit it for review')).toHaveCount(0);
    await expect(page.getByText(/your shop is in review/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /submit for review/i })).toHaveCount(0);

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/artist/${artistSlug}`);
    await expect(anonPage.getByText(displayName).first()).toBeVisible({ timeout: 15_000 });
    await expect(anonPage.getByText(montroseTitle).first()).toBeVisible({ timeout: 15_000 });
    await anon.close();
  });

  // ── 6.6 — pin work ────────────────────────────────────────────────────────

  test('6.6: pin the best piece from the Studio', async () => {
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Pinned Work')).toBeVisible({ timeout: 15_000 });
    await page.locator(`button[title="${montroseTitle}"]`).click();
    await page.getByRole('button', { name: /save pinned work/i }).click();
    await expect(page.getByText(/pinned work updated/i)).toBeVisible({ timeout: 15_000 });
  });

  // ── 6.7 / 6.8 — Stripe handoff (onboarding itself is out of scope) ────────

  test('6.7/6.8: Connect with Stripe reaches Stripe; the app survives coming back', async () => {
    test.setTimeout(120_000);
    const page = artistPage;
    await page.goto('/studio/sales');
    await expect(page.getByRole('heading', { name: 'Sales & Money' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Connect with Stripe' }).click();
    // Express onboarding hands off to a Stripe-hosted page.
    await page.waitForURL(/stripe\.com/, { timeout: 45_000 });
    // Don't complete Stripe's identity flow — come home and confirm nothing broke.
    await page.goto('/studio/sales');
    await expect(page.getByRole('heading', { name: 'Sales & Money' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Connect with Stripe' })).toBeVisible({ timeout: 15_000 });
  });

  // ── 6.10 — series ─────────────────────────────────────────────────────────

  test('6.10: create a series and put a listing in it', async () => {
    test.setTimeout(90_000);
    const page = artistPage;
    await page.goto('/studio/work?tab=series');
    await page.getByRole('button', { name: 'New Series' }).first().click();
    await page.getByLabel('Name').fill(seriesName);
    await page.getByRole('button', { name: 'Create Series' }).click();
    await expect(page.getByText(/series created/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('div.rounded-xl', { hasText: seriesName }).first()).toBeVisible({ timeout: 15_000 });

    // Assign Bayou Study to it via the listing editor.
    await page.goto('/studio/work');
    await page
      .locator('div.rounded-xl', { hasText: bayouTitle })
      .first()
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/listings\/.+\/edit/, { timeout: 15_000 });
    const seriesSelect = page.locator('label:has-text("Series (optional)") + select');
    await seriesSelect.waitFor({ state: 'visible', timeout: 15_000 });
    await seriesSelect.selectOption({ label: seriesName });
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });
  });

  // ── 6.11 — Services tab ───────────────────────────────────────────────────

  test('6.11: the Services tab renders (empty is fine)', async () => {
    const page = artistPage;
    await page.goto('/studio/services');
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/vetted local providers/i)).toBeVisible();
  });

  // ── 6.12 / 6.13 — Local Verified ──────────────────────────────────────────

  test('6.12: Local Verified request — empty details refused, then submitted once', async () => {
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Get Local Verified')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Request verification' }).click();
    // Details are required.
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    // The refusal toast — scoped to the alert region, since the card's own
    // static copy contains the same phrase.
    await expect(
      page.locator('[role="alert"]').getByText(/tell us how you.re connected/i)
    ).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Details').fill('Coursework at Glassell School of Art; shared studio space in Montrose.');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText(/request submitted/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Under review')).toBeVisible({ timeout: 15_000 });
    // No second open request: the form is replaced by the queued message.
    await expect(page.getByRole('button', { name: 'Request verification' })).toHaveCount(0);
    await expect(page.getByText(/your request is in the queue/i)).toBeVisible();
  });

  test('admin approves the Local Verified request', async ({ browser }) => {
    const { ctx, page } = await newAdminPage(browser);
    await page.goto('/admin/verifications');
    const card = page.locator('div.rounded-xl', { hasText: displayName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/artist verified/i)).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });

  test('6.13: the Local Verified badge shows on the public page', async ({ browser }) => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/artist/${artistSlug}`);
    await expect(page.getByText('Local Verified')).toBeVisible({ timeout: 15_000 });
    await anon.close();
  });

  // ── 6.14 — away mode round trip ───────────────────────────────────────────

  test('6.14: away mode shows publicly, then switches cleanly back off', async ({ browser }) => {
    test.setTimeout(90_000);
    const page = artistPage;
    await page.goto('/studio');
    await expect(page.getByText('Away mode')).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Return date (optional)').fill('2026-09-15');
    await page.getByLabel('Away message (optional)').fill('Back from Spring Break April 2!');
    await page.getByRole('button', { name: 'Set my shop to away' }).click();
    await expect(page.getByText(/your shop is paused/i)).toBeVisible({ timeout: 15_000 });

    // Public page carries the away state.
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(`/artist/${artistSlug}`);
    await expect(anonPage.getByText(/Away — back/)).toBeVisible({ timeout: 15_000 });

    // Toggle back off — the switch must not stick.
    await page.getByRole('button', { name: 'Turn off away mode' }).click();
    await expect(page.getByText(/welcome back/i)).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Set my shop to away' })).toBeVisible({ timeout: 15_000 });

    await anonPage.reload();
    await expect(anonPage.getByText(/Away — back/)).toHaveCount(0);
    await anon.close();
  });
});
