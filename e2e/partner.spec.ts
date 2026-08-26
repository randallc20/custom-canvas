import { test, expect, Page, BrowserContext } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Live-test-plan Part 12 — The Partner (gallery/school), walked for real.
 * Serial: ONE fresh partner registered through the real /register form
 * (staging autoconfirm lands straight in /onboarding/gallery), verified by
 * the admin, then taken through profile edit, roster, and curated picks.
 *
 * Requires: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 * Uses live staging data: /api/artists for roster names, /api/listings for
 * pickable titles — steps that need them skip with a reason when staging is
 * too empty.
 *
 * Coverage map (docs/LIVE-TEST-PLAN.md Part 12):
 *  12.1/12.2 register → setup form → Pending Verification
 *  12.3      pending, but not blocked
 *  12.4      admin verifies in /admin/galleries (moves pending → verified)
 *  12.5      verified badge on dashboard + public page
 *  12.6      edit bio/website, shows on public page (NOTE: the edit form has
 *            no banner-image field — the plan's banner step can't be walked)
 *  12.7      roster: add two live artists, public page shows them
 *  12.8      remove (confirm dialog) and re-add
 *  12.9      alumni auto-link — SKIPPED, see the test for the mechanism
 *  12.10-12  picks: add, cap message when 6 reached, curator note, reorder,
 *            remove (piece stays listed)
 *  12.13     signed-out surfaces: /partners directory + homepage shelf
 *            (weekly rotation — asserted only when our org holds the slot)
 *  12.14     partner-as-person: browse the feed, open a listing
 */

const admin = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const ready = !!(admin.email && admin.password);

const RUN = Date.now().toString(36);
const partnerEmail = `e2e.partner.${RUN}@customcanvas.dev`;
const partnerPassword = `Partner-${RUN}-pass`;
const partnerName = `E2E Partner ${RUN}`;
// A school, per the plan (schools also exercise the "Featured" roster heading
// and are an alumni-capable partner type). Unique per run so the shared
// staging DB never collects same-named orgs.
const orgName = `Glassell E2E School ${RUN}`;
const orgBio = `A run-${RUN} teaching studio on the bayou. This organization exists so the e2e suite can walk the whole partner journey for real.`;
const editedBio = `Edited for run ${RUN}: we champion slow painting, honest framing, and artists who show up.`;
const editedWebsite = `https://example.com/e2e-${RUN}`;
const curatorNote = `Chosen for the ${RUN} e2e walk — quiet color, honest light.`;

async function dismissCookies(page: Page) {
  // The fixed cookie banner overlays bottom-of-page controls on mobile
  // viewports — dismiss it the way a person does, once per context.
  const cookie = page.getByRole('button', { name: 'Accept' });
  if (await cookie.isVisible().catch(() => false)) await cookie.click();
}

/** A roster row in the dashboard's Represented Artists list. */
function rosterRow(page: Page, artistName: string) {
  return page
    .locator('div.py-3', { has: page.getByText(artistName, { exact: true }) })
    .first();
}

test.describe.serial('live test plan part 12 — the partner', () => {
  test.skip(!ready, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not configured');

  let partnerContext: BrowserContext;
  let partnerPage: Page;
  let gallerySlug: string;
  // Live staging fixtures, fetched once the partner session exists.
  let artistNames: string[] = [];
  let pickables: { id: string; title: string }[] = [];
  // Titles actually picked, in display order (mutated by reorder/remove).
  let pickedTitles: string[] = [];
  let removedPick: { id: string; title: string } | null = null;

  test.beforeAll(async ({ browser }) => {
    partnerContext = await browser.newContext();
    partnerPage = await partnerContext.newPage();
  });
  test.afterAll(async () => {
    await partnerContext?.close();
  });

  test('12.1/12.2 — register as Partner and finish the setup form', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    await page.goto('/register');
    await dismissCookies(page);

    await page.getByLabel('Full Name').fill(partnerName);
    await page.getByLabel('Email').fill(partnerEmail);
    await page.getByLabel('Password').fill(partnerPassword);
    await page.getByRole('button', { name: 'Partner' }).click();
    await page.getByText(/I agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();

    // Autoconfirm: a partner signup must land on the setup form directly —
    // the automatic hand-off the plan checks in 12.1.
    await expect(page).toHaveURL(/\/onboarding\/gallery/, { timeout: 30_000 });
    await expect(page.getByText('Set Up Your Partner Profile')).toBeVisible({ timeout: 20_000 });

    // 12.2 — the organisation. School, as the plan asks when it's an option.
    await page.locator('select').selectOption('school');
    await page.getByLabel('Organization Name').fill(orgName);
    // The bio textarea's label isn't wired with htmlFor — it's the only
    // textarea on the page.
    await page.locator('textarea').fill(orgBio);
    await page.getByLabel('Address').fill('5101 Montrose Blvd');
    await page.getByLabel('City').fill('Houston');
    await page.getByLabel('Neighborhood').fill('Montrose');
    await page.getByLabel('Website').fill(`https://example.com/glassell-${RUN}`);
    await page.getByRole('button', { name: /submit for verification/i }).click();

    await expect(page.getByText('Pending Verification')).toBeVisible({ timeout: 20_000 });
  });

  test('12.3 — pending, but not blocked', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Partner Dashboard' })).toBeVisible({ timeout: 20_000 });
    // The pending badge names the org type…
    await expect(page.getByText(/Pending Review \(School\)/)).toBeVisible({ timeout: 15_000 });
    // …and the note says waiting is not blocking.
    await expect(page.getByText(/still set up your profile and add artists while you wait/i)).toBeVisible();
    // Prove the claim: both doors are actually open while pending.
    await expect(page.getByRole('button', { name: 'Add Artist' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Edit Profile' })).toBeVisible();

    // Grab the public slug for every later public-page check.
    const href = await page.getByRole('link', { name: 'View Public Page' }).getAttribute('href');
    gallerySlug = href!.match(/\/gallery\/(.+)$/)![1];
    expect(gallerySlug).toBeTruthy();
  });

  test('12.4 — admin verifies the org and it moves to the verified list', async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/login');
    await dismissCookies(page);
    await login(page, admin.email!, admin.password!);

    await page.goto('/admin/galleries');
    const card = page.locator('div.rounded-lg', { hasText: orgName }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    // The org's details are on the card for the admin to judge.
    await expect(card.getByText('5101 Montrose Blvd')).toBeVisible();
    await expect(card.getByText('Pending', { exact: true })).toBeVisible();

    await card.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByText('Partner verified!')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('div.rounded-lg', { hasText: orgName })).toHaveCount(0);

    // It moved to the verified list.
    await page.getByRole('button', { name: 'Verified', exact: true }).click();
    const verifiedCard = page.locator('div.rounded-lg', { hasText: orgName }).first();
    await expect(verifiedCard).toBeVisible({ timeout: 20_000 });
    await expect(verifiedCard.getByText('Verified', { exact: true })).toBeVisible();
    await ctx.close();
  });

  test('12.5 — the partner sees the verified badge, dashboard and public page', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    await page.goto('/dashboard');
    await expect(page.getByText('Verified School')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Pending Review/)).toHaveCount(0);
    // Verification also unlocks the picks manager.
    await expect(page.getByText(/Your Picks \(\d\/6\)/)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/gallery/${gallerySlug}`);
    await expect(page.getByRole('heading', { name: orgName })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Verified School')).toBeVisible();
  });

  test('12.6 — edit the public profile (bio + website)', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    await page.goto('/profile/edit');
    await expect(page.getByRole('heading', { name: 'Edit Partner Profile' })).toBeVisible({ timeout: 20_000 });
    // NOTE: the plan asks for a banner image here, but the edit form has no
    // banner upload — bio + website are what can actually be edited.
    // Deliberately DO NOT touch Organization Name: renaming a verified org
    // resets its verification by design (impostor guard).
    await expect(page.getByLabel('Organization Name')).toHaveValue(orgName);
    await page.getByLabel('Bio').fill(editedBio);
    await page.getByLabel('Website').fill(editedWebsite);
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Profile updated!')).toBeVisible({ timeout: 20_000 });

    // The public page shows the new bio — and the badge survived the edit.
    await page.goto(`/gallery/${gallerySlug}`);
    await expect(page.getByText(editedBio)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Verified School')).toBeVisible();
  });

  test('12.7 — build a roster with two live artists', async () => {
    test.setTimeout(180_000);
    const page = partnerPage;

    // Live artists from staging — the roster search matches display_name.
    const res = await page.request.get('/api/artists');
    const artists = res.ok() ? await res.json() : [];
    const names: string[] = Array.isArray(artists)
      ? artists.map((a: { display_name?: string }) => a.display_name ?? '').filter((n: string) => n.length >= 3)
      : [];
    // Names that appear once, so search results and roster rows are unambiguous.
    artistNames = names.filter((n) => names.indexOf(n) === names.lastIndexOf(n)).slice(0, 2);
    test.skip(artistNames.length < 2, 'staging has fewer than two uniquely-named live artists');

    await page.goto('/dashboard');
    for (let i = 0; i < artistNames.length; i++) {
      const name = artistNames[i];
      await page.getByRole('button', { name: 'Add Artist' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText('Add Artist')).toBeVisible({ timeout: 10_000 });
      await dialog.getByPlaceholder('Search by artist name...').fill(name);
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      const row = dialog.locator('div.py-2', { hasText: name }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByText('Artist added to your gallery.').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(`Represented Artists (${i + 1})`)).toBeVisible({ timeout: 20_000 });
    }

    // The public page shows them — under "Featured" for a school.
    await page.goto(`/gallery/${gallerySlug}`);
    await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible({ timeout: 20_000 });
    for (const name of artistNames) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  test('12.8 — remove an artist (confirm dialog) and re-add', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    test.skip(artistNames.length < 2, 'roster was not built (12.7 skipped)');
    const [first] = artistNames;

    await page.goto('/dashboard');
    await expect(page.getByText('Represented Artists (2)')).toBeVisible({ timeout: 20_000 });
    await rosterRow(page, first).getByRole('button', { name: 'Remove' }).click();

    // It asks first.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Remove artist?')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/no longer appear on your roster/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('Artist removed.')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Represented Artists (1)')).toBeVisible({ timeout: 20_000 });

    // Add her back.
    await page.getByRole('button', { name: 'Add Artist' }).click();
    const addDialog = page.getByRole('dialog');
    await addDialog.getByPlaceholder('Search by artist name...').fill(first);
    await addDialog.getByRole('button', { name: 'Search', exact: true }).click();
    const row = addDialog.locator('div.py-2', { hasText: first }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Represented Artists (2)')).toBeVisible({ timeout: 20_000 });
  });

  test('12.9 — alumni appear automatically', async () => {
    // Mechanism (00008_partner_hardening.sql): artist_education.partner_id is
    // linked by link_education_partners(), which runs when an ARTIST saves
    // their education and matches lower(trim(institution)) against VERIFIED
    // school/museum/residency names. This run's org name is unique, so no
    // existing staging artist can already reference it, and verifying the
    // partner does NOT retro-link old education rows. Exercising this would
    // mean creating + approving a whole artist and re-saving their education
    // here — out of scope for the partner spec. Covered structurally by the
    // public page's "Alumni & Students" section rendering path.
    test.skip(true, 'alumni links form on artist-education save, not on partner verification — needs a live artist edit to demonstrate');
  });

  test('12.10 — curate picks (with the cap of six when staging allows)', async () => {
    test.setTimeout(300_000);
    const page = partnerPage;

    // Live available listings to pick from — titles must be search-friendly
    // and unique so each result row is unambiguous.
    const res = await page.request.get('/api/listings');
    const listings = res.ok() ? await res.json() : [];
    const all: { id: string; title: string }[] = Array.isArray(listings)
      ? listings.map((l: { id: string; title?: string }) => ({ id: l.id, title: (l.title ?? '').trim() }))
      : [];
    const titles = all.map((l) => l.title.toLowerCase());
    pickables = all
      .filter((l) => /^[A-Za-z0-9 .,'()&:-]{4,60}$/.test(l.title))
      .filter((l) => titles.indexOf(l.title.toLowerCase()) === titles.lastIndexOf(l.title.toLowerCase()))
      .slice(0, 6);
    test.skip(pickables.length < 3, 'staging has fewer than three uniquely-titled available listings');

    await page.goto('/dashboard');
    const picksSection = page.locator('div.rounded-xl', { hasText: 'Your Picks' }).first();
    await expect(picksSection).toBeVisible({ timeout: 20_000 });

    for (let i = 0; i < pickables.length; i++) {
      const pick = pickables[i];
      await picksSection.getByPlaceholder(/Search available listings/).fill(pick.title);
      await picksSection.getByRole('button', { name: 'Search', exact: true }).click();
      const row = picksSection.locator('li', { hasText: pick.title }).filter({ has: page.getByRole('button', { name: 'Pick' }) }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole('button', { name: 'Pick', exact: true }).click();
      await expect(picksSection.getByText(`Your Picks (${i + 1}/6)`)).toBeVisible({ timeout: 20_000 });
      pickedTitles.push(pick.title);
    }

    if (pickables.length === 6) {
      // The cap of six, enforced clearly: the search goes away.
      await expect(picksSection.getByText(/Your picks are full — remove one/)).toBeVisible();
      await expect(picksSection.getByPlaceholder(/Search available listings/)).toHaveCount(0);
    } else {
      test.info().annotations.push({
        type: 'note',
        description: `only ${pickables.length} pickable listings on staging — the six-pick cap was not exercised`,
      });
    }
  });

  test('12.11 — a curator\'s note shows publicly, in quote marks', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    test.skip(pickedTitles.length < 3, 'picks were not curated (12.10 skipped)');

    await page.goto('/dashboard');
    const picksSection = page.locator('div.rounded-xl', { hasText: 'Your Picks' }).first();
    const firstPick = picksSection.locator('li', { hasText: pickedTitles[0] }).first();
    await firstPick.getByPlaceholder(/Why you chose this piece/).fill(curatorNote);
    await firstPick.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Note saved.')).toBeVisible({ timeout: 20_000 });

    // Public page: the note under the piece, in (typographic) quote marks.
    await page.goto(`/gallery/${gallerySlug}`);
    await expect(page.getByRole('heading', { name: 'Our picks' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`“${curatorNote}”`)).toBeVisible({ timeout: 15_000 });
  });

  test('12.12 — reorder picks (public page follows) and remove one', async () => {
    test.setTimeout(180_000);
    const page = partnerPage;
    test.skip(pickedTitles.length < 3, 'picks were not curated (12.10 skipped)');

    await page.goto('/dashboard');
    const picksSection = page.locator('div.rounded-xl', { hasText: 'Your Picks' }).first();
    const items = picksSection.locator('ul > li');
    await expect(items.first()).toContainText(pickedTitles[0], { timeout: 20_000 });

    // Move the first pick down one — the second becomes first.
    await items.first().getByRole('button', { name: 'Move down' }).click();
    await expect(items.first()).toContainText(pickedTitles[1], { timeout: 20_000 });
    [pickedTitles[0], pickedTitles[1]] = [pickedTitles[1], pickedTitles[0]];

    // The public page follows the new order.
    await page.goto(`/gallery/${gallerySlug}`);
    const shelf = page.locator('section', { has: page.getByRole('heading', { name: 'Our picks' }) }).first();
    await expect(shelf.locator('h3').first()).toHaveText(pickedTitles[0], { timeout: 20_000 });

    // Remove the last pick: confirmation says the piece stays listed.
    await page.goto('/dashboard');
    const lastTitle = pickedTitles[pickedTitles.length - 1];
    removedPick = pickables.find((p) => p.title === lastTitle) ?? null;
    const lastRow = picksSection.locator('li', { hasText: lastTitle }).first();
    await lastRow.getByRole('button', { name: 'Remove', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Remove pick?')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/stays listed — it just leaves your picks/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('Pick removed.')).toBeVisible({ timeout: 20_000 });
    pickedTitles.pop();
    await expect(picksSection.getByText(`Your Picks (${pickedTitles.length}/6)`)).toBeVisible({ timeout: 20_000 });

    // And the piece really does stay listed.
    if (removedPick) {
      await page.goto(`/listing/${removedPick.id}`);
      await expect(page.getByText(removedPick.title).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('12.13 — signed-out surfaces: partners directory + homepage shelf', async ({ browser }) => {
    test.setTimeout(120_000);
    const anon = await browser.newContext();
    const page = await anon.newPage();

    // Deterministic: the verified org is in the public partners directory.
    await page.goto('/partners?type=school');
    await dismissCookies(page);
    await expect(page.getByText(orgName)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`a[href="/gallery/${gallerySlug}"]`)).toBeVisible();

    // The homepage "Partner picks" shelf rotates weekly among verified
    // partners holding 3+ available picks — ours is eligible only when 12.10
    // ran and 12.12 left at least three. Assert ownership only when we
    // actually hold this week's slot.
    await page.goto('/');
    const credited = await page
      .getByText(`Picked by ${orgName}`)
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (credited) {
      await expect(page.getByText('Partner picks')).toBeVisible();
      await expect(page.getByRole('link', { name: /visit partner/i })).toHaveAttribute('href', `/gallery/${gallerySlug}`);
    } else {
      test.info().annotations.push({
        type: 'note',
        description:
          pickedTitles.length >= 3
            ? 'homepage shelf held by another partner this week (deterministic weekly rotation) — our org is eligible but not selected'
            : `our org holds ${pickedTitles.length} picks (<3), so it is not shelf-eligible this run`,
      });
    }
    await anon.close();
  });

  test('12.14 — partners are people too: browse the feed, open a listing', async () => {
    test.setTimeout(120_000);
    const page = partnerPage;
    await page.goto('/');
    const card = page.locator('a[href^="/listing/"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 20_000 });
    // The listing page renders like it would for any signed-in art lover.
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 });
  });
});
