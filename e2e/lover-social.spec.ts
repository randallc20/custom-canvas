import { test, expect, Page, BrowserContext } from '@playwright/test';
import { login } from './helpers/auth';
import { fetchAvailableListings, fetchLiveArtists } from './helpers/data';

/**
 * Part 8 of docs/LIVE-TEST-PLAN.md — The Art Lover: browsing and talking.
 * Serial walk with TWO browser contexts:
 *   - a FRESH lover registered through the real /register form each run
 *     (DEV/staging autoconfirm signs them straight in and lands on /), and
 *   - the live approved artist from E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD.
 *
 * Covers (plan step → test):
 *   8.1  fresh lover lands on home, top-right menu has the buyer entries
 *   8.2  save a piece → on /saved → unsave → gone
 *   8.3  follow the artist → /following lists them
 *   8.4  artist's follow notification (created by the 00047 trigger on
 *        `follows` — P5 closed the gap where the type existed but nothing
 *        ever inserted one)
 *   8.5  recently-viewed shelf on home after opening two pieces
 *   8.6  message the artist from a listing: pinned context banner, prefilled
 *        draft, composer visible without scrolling, send
 *   8.7  photo attachment (E2E_SMALL_IMAGE) + a PDF (inline buffer)
 *   8.8  16MB file (E2E_BIG_IMAGE) over the 10MB chat-attachments bucket cap:
 *        asserts no hang and no phantom message. NOTE: MessageInput swallows
 *        the storage rejection silently (catch with no toast) — the plan's
 *        "clear message about the limit" does NOT exist today; app issue.
 *   8.9  artist sees the conversation with an unread badge and replies
 *   8.10 lover sees the reply; unread badge clears after reading (best-effort)
 *   8.11 mute the conversation (muted marker in the inbox), then unmute
 *   8.12 /account renders; an email-preference toggle persists across reload
 *   8.13/8.14 password mismatch errors clearly; real change + re-login works
 *   8.16 /notifications renders for the lover
 *   8.17/8.18 artist page as a buyer + "is it framed?" question in the thread
 *
 * Not covered: 8.15 (unsubscribe requires a received email — out of scope).
 * Known app quirk exercised around: TrackView fires on mount and can record a
 * listing view before AuthContext hydrates on a hard navigation (view lands
 * unattributed) — 8.5 therefore uses client-side card clicks only.
 */

const artistCreds = {
  email: process.env.E2E_ARTIST_EMAIL,
  password: process.env.E2E_ARTIST_PASSWORD,
};
const smallImage = process.env.E2E_SMALL_IMAGE;
const bigImage = process.env.E2E_BIG_IMAGE;
const ready = !!(artistCreds.email && artistCreds.password);

// Salted with the worker index: the chromium and mobile projects each run
// this file in their own worker and must register DIFFERENT lover accounts.
const RUN = `${Date.now().toString(36)}w${process.env.TEST_PARALLEL_INDEX ?? '0'}`;
const loverName = `E2E Lover ${RUN}`;
const loverEmail = `e2e.lover.${RUN}@customcanvas.dev`;
const loverPassword = `Lover-${RUN}-pass1`;
const loverNewPassword = `Lover-${RUN}-pass2`;
const replyText = `Reply from the artist ${RUN}`;

// A minimal but valid PDF, attached inline so the PDF half of 8.7 needs no
// extra fixture env var.
const TINY_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF
`
);

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The fixed cookie banner overlays bottom-of-page buttons (especially on the
 *  mobile project) — dismiss it the way a person does, once per context. */
async function dismissCookies(page: Page) {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

/** Top-right avatar menu on desktop, hamburger menu on mobile — both expose
 *  the same buyer entries (My Account / Saved Art / Following / Orders). */
async function openUserMenu(page: Page) {
  const desktop = (page.viewportSize()?.width ?? 1280) >= 768;
  const toggle = desktop
    ? page.locator('nav button.h-8.w-8') // the initial-letter avatar button
    : page.locator('nav button.md\\:hidden'); // the hamburger
  await toggle.waitFor({ state: 'visible', timeout: 15_000 });
  await toggle.click();
}

/** Composer send button, scoped to the message-input row (the cookie banner's
 *  Accept button shares the bg-terra rounded-full classes). */
function sendButton(page: Page) {
  return page.locator('div.flex.items-end.gap-2 button.bg-terra');
}

function chatTextarea(page: Page) {
  return page.locator('textarea[placeholder="Type a message..."], textarea[placeholder="Uploading…"]');
}

test.describe.serial('lover social journey (live-test-plan part 8)', () => {
  test.skip(!ready, 'E2E_ARTIST_EMAIL/PASSWORD not set');

  let loverContext: BrowserContext;
  let loverPage: Page;
  let artistContext: BrowserContext;
  let artistPage: Page;

  // Identified from the live env artist in the setup test below.
  let artistSlug: string;
  let artistDisplayName: string;
  let artistFullName: string; // profile full_name, as chat headers/rows show it
  let listingId: string;
  let listingTitle: string;
  let conversationId: string;

  test.beforeAll(async ({ browser }) => {
    loverContext = await browser.newContext();
    loverPage = await loverContext.newPage();
    artistContext = await browser.newContext();
    artistPage = await artistContext.newPage();
  });
  test.afterAll(async () => {
    await loverContext?.close();
    await artistContext?.close();
  });

  test('8.1 — fresh Art Lover registers and lands on the home feed signed in', async () => {
    test.setTimeout(90_000);
    const page = loverPage;
    await page.goto('/register');
    await dismissCookies(page);
    await page.getByLabel('Full Name').fill(loverName);
    await page.getByLabel('Email').fill(loverEmail);
    await page.getByLabel('Password').fill(loverPassword);
    await page.getByRole('button', { name: 'Art Lover' }).click();
    await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();

    // Autoconfirm: no "Check Your Email" screen — buyers go straight to the
    // normal home page, not a dashboard.
    await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
    await expect(page.getByText('Check Your Email')).toHaveCount(0);

    // The top-right menu carries the buyer entries.
    await openUserMenu(page);
    for (const item of ['My Account', 'Saved Art', 'Following', 'Orders']) {
      await expect(page.getByRole('link', { name: item })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('setup — env artist signs in and the target listing is identified', async () => {
    test.setTimeout(90_000);
    const page = artistPage;
    await page.goto('/login');
    await dismissCookies(page);
    await login(page, artistCreds.email!, artistCreds.password!);

    // The artist's own slug via the Studio profile page's preview link — the
    // public artist rows carry no email to match on.
    await page.goto('/studio/page');
    const preview = page.getByRole('link', { name: /preview as visitor/i });
    await preview.waitFor({ state: 'visible', timeout: 20_000 });
    artistSlug = (await preview.getAttribute('href'))!.match(/\/artist\/([^?]+)/)![1];
    expect(artistSlug).toBeTruthy();

    const artists = await fetchLiveArtists(page.request);
    const me = artists.find((a) => a.slug === artistSlug);
    expect(me, `env artist ${artistSlug} is not among the live artists — not live?`).toBeTruthy();
    artistDisplayName = me!.display_name ?? '';

    const listings = await fetchAvailableListings(page.request);
    const mine = listings.filter((l) => l.artist_id === me!.id);
    expect(mine.length, 'env artist has no available listings').toBeGreaterThan(0);
    listingId = mine[0].id;
    listingTitle = mine[0].title;
  });

  test('8.2 — save a piece, see it on /saved, unsave it', async () => {
    test.setTimeout(90_000);
    const page = loverPage;
    await page.goto('/');
    // Hearts render only once AuthContext has hydrated the signed-in user.
    const anyHeart = page.locator('button[aria-label="Save"], button[aria-label="Unsave"]');
    await anyHeart.first().waitFor({ state: 'visible', timeout: 20_000 });

    // Prefer the env artist's listing card if the home feed shows it; the
    // heart lives on feed cards (the listing detail page has no save heart,
    // nor does the artist page's gallery grid), so fall back to the first
    // saveable card.
    let card = page
      .locator(`a[href="/listing/${listingId}"]`)
      .filter({ has: page.locator('button[aria-label="Save"]') })
      .first();
    if ((await card.count()) === 0) {
      card = page
        .locator('a[href^="/listing/"]')
        .filter({ has: page.locator('button[aria-label="Save"]') })
        .first();
    }
    // Pin the card by href BEFORE saving: the filter above selects on "has a
    // Save button", so a successful save makes the card stop matching itself.
    // Scope to the Discover grid — the hero art strip links to the same
    // listings with image-only anchors (no h3, no heart).
    const savedHref = await card.getAttribute('href');
    const pinned = page.locator(`#feed a[href="${savedHref}"]`).first();
    const savedTitle = (await pinned.locator('h3').first().innerText()).trim();
    await pinned.locator('button[aria-label="Save"]').first().click();
    // Responds instantly: the heart flips to Unsave.
    await expect(pinned.locator('button[aria-label="Unsave"]').first()).toBeVisible({ timeout: 10_000 });

    await page.goto('/saved');
    await expect(page.getByText(savedTitle).first()).toBeVisible({ timeout: 15_000 });

    // Unsave from the Saved Art page — the card leaves the list.
    await page
      .locator('a[href^="/listing/"]')
      .filter({ hasText: savedTitle })
      .locator('button[aria-label="Unsave"]')
      .first()
      .click();
    await expect(page.getByText(savedTitle)).toHaveCount(0, { timeout: 15_000 });
  });

  test('8.3 — follow the artist; /following lists them', async () => {
    test.setTimeout(90_000);
    const page = loverPage;
    await page.goto(`/artist/${artistSlug}`);
    const follow = page.getByRole('button', { name: 'Follow', exact: true });
    await follow.waitFor({ state: 'visible', timeout: 20_000 });
    await follow.click();
    await expect(page.getByRole('button', { name: 'Following' })).toBeVisible({ timeout: 15_000 });

    await page.goto('/following');
    await expect(page.getByText(artistDisplayName).first()).toBeVisible({ timeout: 15_000 });
  });

  test('8.4 — artist gets a new-follower notification', async () => {
    test.setTimeout(60_000);
    const page = artistPage;
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible({ timeout: 15_000 });

    // 00047 creates these via a trigger on follows (P5 closed the old gap
    // where the type existed but nothing ever inserted one). The list is
    // fetch-once — reload until the row lands.
    const followerNotif = page.getByText(/started following you/i).first();
    await expect(async () => {
      if (!(await followerNotif.isVisible().catch(() => false))) await page.reload();
      await expect(followerNotif).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 45_000 });
  });

  test('8.5 — recently-viewed shelf appears after opening two pieces', async () => {
    test.setTimeout(120_000);
    const page = loverPage;
    await page.goto('/');
    // Wait for auth hydration (hearts) BEFORE clicking through: TrackView
    // fires once on mount, so a hard navigation to /listing/… can record the
    // view before the user context loads, leaving it unattributed.
    const heart = page.locator('button[aria-label="Save"], button[aria-label="Unsave"]');
    await heart.first().waitFor({ state: 'visible', timeout: 20_000 });

    const cards = page.locator('a[href^="/listing/"]').filter({ has: page.locator('button[aria-label]') });
    const first = cards.first();
    const firstTitle = (await first.locator('h3').first().innerText()).trim();
    await first.click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 15_000 });
    await page.goBack();
    await heart.first().waitFor({ state: 'visible', timeout: 20_000 });

    let second = cards.filter({ hasNotText: firstTitle }).first();
    if ((await second.count()) === 0) second = cards.first();
    await second.click();
    await expect(page).toHaveURL(/\/listing\//, { timeout: 15_000 });

    await page.goto('/');
    const shelf = page.locator('section', { hasText: 'Recently viewed' });
    await expect(shelf.getByRole('heading', { name: 'Recently viewed' })).toBeVisible({ timeout: 20_000 });
    await expect(shelf.getByText(firstTitle).first()).toBeVisible({ timeout: 15_000 });
  });

  test('8.6 — message the artist from a listing: pinned context, prefill, send', async () => {
    test.setTimeout(120_000);
    const page = loverPage;
    await page.goto(`/listing/${listingId}`);
    const msgBtn = page.getByRole('button', { name: 'Message Artist' });
    await msgBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await msgBtn.click();

    await page.waitForURL(/\/messages\/[^/?]+/, { timeout: 20_000 });
    conversationId = page.url().match(/\/messages\/([^/?]+)/)![1];

    // The piece is pinned at the top as context (ContextBanner links back to
    // the listing), and the draft is pre-written from the listing.
    await expect(
      page.locator(`a[href="/listing/${listingId}"]`).filter({ hasText: listingTitle })
    ).toBeVisible({ timeout: 20_000 });
    const textarea = chatTextarea(page);
    await expect(textarea).toHaveValue(
      new RegExp(`^${escapeRegExp(`Hi, I'm interested in "${listingTitle}"`)}`),
      { timeout: 15_000 }
    );

    // The composer and send button must be usable without scrolling the page.
    await expect(textarea).toBeInViewport();
    await expect(sendButton(page)).toBeInViewport();

    // Grab the counterpart's display name from the thread header — inbox rows
    // and chat headers show profiles.full_name, not the artist display name.
    artistFullName = (
      await page.locator('div.border-b.border-line span.text-sm.font-medium').first().innerText()
    ).trim();

    await sendButton(page).click();
    await expect(page.getByText(/Is this still available\?/).first()).toBeVisible({ timeout: 15_000 });
    await expect(textarea).toHaveValue('');
  });

  test('8.7 — send a photo and a PDF attachment', async () => {
    test.skip(!smallImage, 'E2E_SMALL_IMAGE not configured');
    test.setTimeout(120_000);
    const page = loverPage;
    // Still on the conversation from 8.6; make sure regardless.
    await page.goto(`/messages/${conversationId}`);
    await chatTextarea(page).waitFor({ state: 'visible', timeout: 20_000 });

    // The hidden inputs fire their own onChange — no need to open the "+"
    // menu (which would pop a native file chooser).
    await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(smallImage!);
    await expect(page.locator('img[alt="Shared image"]').first()).toBeVisible({ timeout: 45_000 });

    await page.locator('input[accept="application/pdf"]').setInputFiles({
      name: `framing-question-${RUN}.pdf`,
      mimeType: 'application/pdf',
      buffer: TINY_PDF,
    });
    // File bubbles render the filename as the download link text.
    await expect(page.getByText(`framing-question-${RUN}.pdf`).first()).toBeVisible({ timeout: 45_000 });
  });

  test('8.8 — a 16MB file is rejected without hanging or a phantom message', async () => {
    test.skip(!bigImage, 'E2E_BIG_IMAGE not configured');
    test.setTimeout(180_000);
    const page = loverPage;
    await page.goto(`/messages/${conversationId}`);
    await chatTextarea(page).waitFor({ state: 'visible', timeout: 20_000 });
    // Let the thread finish rendering (8.7's photo is in it) before counting,
    // or the baseline is 0 and the old image later reads as a phantom.
    await expect(page.locator('img[alt="Shared image"]').first()).toBeVisible({ timeout: 20_000 });
    const imagesBefore = await page.locator('img[alt="Shared image"]').count();

    await page.locator('input[accept="image/jpeg,image/png,image/webp"]').setInputFiles(bigImage!);
    // The upload state may flash by if storage rejects fast — don't require it.
    await page
      .getByPlaceholder('Uploading…')
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {});
    // The chat-attachments bucket caps files at 10MB (migration 00012), so
    // storage refuses the PUT. What the app must NOT do: spin forever or post
    // a broken message. NOTE (app issue, plan 8.8 expects better): the catch
    // in MessageInput.handleFile swallows the failure with NO toast — the
    // "clear message about the limit" the plan calls for does not exist yet.
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('img[alt="Shared image"]')).toHaveCount(imagesBefore);
    await expect(page.getByText('Loading image…')).toHaveCount(0);
  });

  test('8.9 — artist sees the conversation with an unread badge and replies', async () => {
    test.setTimeout(120_000);
    const page = artistPage;
    await page.goto('/messages');
    const row = page.locator('a[href^="/messages/"]').filter({ hasText: loverName }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    // Unread count pill on the thread row.
    await expect(row.locator('span.bg-terraText').first()).toBeVisible({ timeout: 15_000 });

    await row.click();
    await page.waitForURL(/\/messages\/[^/?]+/, { timeout: 15_000 });
    await expect(page.getByText(/Is this still available\?/).first()).toBeVisible({ timeout: 20_000 });

    const textarea = chatTextarea(page);
    await textarea.fill(replyText);
    await sendButton(page).click();
    await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 15_000 });
  });

  test('8.10 — lover sees the reply; unread badge clears after reading', async () => {
    test.setTimeout(120_000);
    const page = loverPage;
    await page.goto('/messages');
    const row = page.locator('a[href^="/messages/"]').filter({ hasText: artistFullName }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText(replyText)).toBeVisible({ timeout: 20_000 });

    // Best-effort: the lover's tab was open on the thread while the reply
    // landed, so realtime may already have marked it read — only assert the
    // clear when a badge is actually showing.
    const hadBadge = await row.locator('span.bg-terraText').first().isVisible().catch(() => false);

    await row.click();
    await page.waitForURL(/\/messages\/[^/?]+/, { timeout: 15_000 });
    await expect(page.getByText(replyText).first()).toBeVisible({ timeout: 20_000 });

    if (hadBadge) {
      await page.goto('/messages');
      const rowAgain = page.locator('a[href^="/messages/"]').filter({ hasText: artistFullName }).first();
      await expect(rowAgain.locator('span.bg-terraText')).toHaveCount(0, { timeout: 20_000 });
    }
  });

  test('8.11 — mute the conversation, see the muted marker, unmute', async () => {
    test.setTimeout(120_000);
    const page = loverPage;
    await page.goto(`/messages/${conversationId}`);
    await page.getByLabel('Conversation options').click();
    await page.getByRole('button', { name: 'Mute conversation' }).click();
    await expect(page.getByText('Conversation muted')).toBeVisible({ timeout: 15_000 });

    // Muted marker (crossed speaker icon) on the thread in the inbox list.
    await page.goto('/messages');
    await expect(page.locator('svg[aria-label="Muted"]').first()).toBeVisible({ timeout: 15_000 });

    await page.goto(`/messages/${conversationId}`);
    await page.getByLabel('Conversation options').click();
    await page.getByRole('button', { name: 'Unmute conversation' }).click();
    await expect(page.getByText('Conversation unmuted')).toBeVisible({ timeout: 15_000 });
    await page.goto('/messages');
    await expect(page.locator('svg[aria-label="Muted"]')).toHaveCount(0, { timeout: 15_000 });
  });

  test('8.12 — /account renders; an email preference flips and persists', async () => {
    test.setTimeout(90_000);
    const page = loverPage;
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'My Account' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Email')).toHaveValue(loverEmail);
    // Role shown but not editable.
    await expect(page.getByLabel('Role')).toBeDisabled();

    // Email Preferences: all four switches default on — flip one off, save,
    // reload, it stayed off.
    await expect(page.getByRole('heading', { name: 'Email Preferences' })).toBeVisible({ timeout: 15_000 });
    const marketing = page.getByRole('checkbox', { name: /product news/i });
    await marketing.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(marketing).toBeChecked();
    await marketing.uncheck();
    await page.getByRole('button', { name: 'Save Preferences' }).click();
    await expect(page.getByText('Email preferences saved')).toBeVisible({ timeout: 15_000 });

    await page.reload();
    const marketingAfter = page.getByRole('checkbox', { name: /product news/i });
    await marketingAfter.waitFor({ state: 'visible', timeout: 15_000 });
    // The checkbox renders its default (checked) until saved prefs hydrate,
    // and under back-to-back runs hydration can strand entirely — reload
    // like a person would until the persisted value shows.
    await expect(async () => {
      if (await marketingAfter.isChecked().catch(() => true)) await page.reload();
      await expect(marketingAfter).not.toBeChecked({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
  });

  test('8.13/8.14 — password mismatch errors; real change re-logs-in', async () => {
    test.setTimeout(120_000);
    const page = loverPage;
    await page.goto('/account');
    await page.getByRole('button', { name: 'Change Password' }).click();

    // Mismatch first: it must say so, not silently do nothing.
    await page.getByLabel('New Password').fill(loverNewPassword);
    await page.getByLabel('Confirm Password').fill(`${loverNewPassword}-nope`);
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible({ timeout: 15_000 });

    // Now for real.
    await page.getByLabel('Confirm Password').fill(loverNewPassword);
    await page.getByRole('button', { name: 'Update Password' }).click();
    await expect(page.getByText('Password updated!')).toBeVisible({ timeout: 15_000 });

    // Sign out and back in with the NEW password.
    await openUserMenu(page);
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await login(page, loverEmail, loverNewPassword);
    await page.goto('/account');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByLabel('Email')).toHaveValue(loverEmail, { timeout: 15_000 });
  });

  test('8.16 — notifications page renders for the lover', async () => {
    test.setTimeout(60_000);
    const page = loverPage;
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible({ timeout: 15_000 });
    // Either real rows or the honest empty state — never a blank error.
    await expect(
      page.getByText(/No notifications/).or(page.locator('div.divide-y')).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('8.17/8.18 — artist page as a buyer + ask whether the piece is framed', async () => {
    test.setTimeout(120_000);
    const page = loverPage;

    // 8.17: the public page a buyer judges the artist by.
    await page.goto(`/artist/${artistSlug}`);
    await expect(page.getByRole('heading', { name: artistDisplayName })).toBeVisible({ timeout: 20_000 });
    const hasStory = await page.getByText('My Story').first().isVisible().catch(() => false);
    if (!hasStory) {
      test.info().annotations.push({
        type: 'note',
        description: 'env artist has no story/statement filled in — 8.17 read-through is content-dependent',
      });
    }

    // 8.18: the on-record framing question, from the listing context (this
    // thread matters for Part 9's seller-protection rules).
    // Retry the whole navigation: this late in a heavy suite, throttled auth
    // can degrade the session mid-click and AuthGuard bounces to / or /login
    // (both observed) — recover the way a person does, by going back to the
    // listing and clicking again.
    await expect(async () => {
      if (/\/login/.test(page.url())) {
        await login(page, loverEmail, loverNewPassword); // bounced fully out — sign back in
      }
      await page.goto(`/listing/${listingId}`);
      const msgBtn = page.getByRole('button', { name: 'Message Artist' });
      await msgBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await msgBtn.click();
      await page.waitForURL(/\/messages\/[^/?]+/, { timeout: 15_000 });
    }).toPass({ timeout: 90_000 });

    const question = `Is this piece framed, or would I need to frame it myself? (${RUN})`;
    const textarea = chatTextarea(page);
    await textarea.waitFor({ state: 'visible', timeout: 20_000 });
    // Let the ?prefill effect land FIRST — filling before it runs means the
    // prefill overwrites the question and the wrong text gets sent.
    await expect(textarea).toHaveValue(/interested in/, { timeout: 10_000 }).catch(() => {});
    await textarea.fill(question); // replaces the prefill
    // Prove the draft holds OUR text before sending (the prefill effect once
    // overwrote it), then send the way a person does.
    await expect(textarea).toHaveValue(question);
    await textarea.press('Enter');
    // Send-after-heavy-suite-state can stall in this context even though the
    // app path is verified good (probed: 200 + bubble before AND after a
    // password change). Recover the way a person does: reload and resend.
    const bubble = page.locator('p.whitespace-pre-wrap', { hasText: question });
    const threadUrl = page.url();
    await expect(async () => {
      if (!(await bubble.first().isVisible().catch(() => false))) {
        // Same degraded-session recovery as the navigation above: a reload
        // can land on /login when the session actually died — sign back in
        // and return to the thread, the way a person would.
        if (/\/login/.test(page.url())) {
          await login(page, loverEmail, loverNewPassword);
          await page.goto(threadUrl);
        } else {
          await page.reload();
        }
        const again = chatTextarea(page);
        await again.waitFor({ state: 'visible', timeout: 15_000 });
        await again.fill(question);
        await again.press('Enter');
      }
      await expect(bubble.first()).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });
  });
});
