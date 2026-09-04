import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';
import { login } from './helpers/auth';

/**
 * Live-test-plan Part 11 — Commissions, walked in a real browser.
 * (docs/LIVE-TEST-PLAN.md 11.1–11.14.)
 *
 * Commissions move no money at launch: request → quote → accept → progress
 * updates → deliver → confirm, with decline/cancel/dispute side paths. The
 * commission's home is its conversation (/messages/<id>) — a details rail on
 * desktop, a "Commission details" sheet on phones — and this suite runs on
 * both playwright projects, so panel access goes through openCommissionPanel.
 *
 * Requires:
 *   E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD  (an approved, live artist)
 *   E2E_SMALL_IMAGE                         (a tiny png, for the WIP photo)
 * The art lover is registered fresh through the real form each run
 * (DEV/staging autoconfirm signs them straight in).
 *
 * Wordings asserted here come from the shipped components. DB status
 * `cancelled` is shared by decline/cancel/quote-decline, but since P6 the
 * panel labels it by closer: "Declined by artist" / "Cancelled by you"
 * (with the artist's optional note shown to the requester). Old
 * /commissions links forward to the inbox's Commissions tab.
 */

const artist = {
  email: process.env.E2E_ARTIST_EMAIL,
  password: process.env.E2E_ARTIST_PASSWORD,
};
const smallImage = process.env.E2E_SMALL_IMAGE;
const ready = !!(artist.email && artist.password && smallImage);

const RUN = Date.now().toString(36);
const loverEmail = `e2e.comm.${RUN}@customcanvas.dev`;
const loverPassword = `Comm-${RUN}-pass`;
const loverName = `Comm Lover ${RUN}`;

const title1 = `A portrait of my dog ${RUN}`;
const title2 = `A second request to decline ${RUN}`;
const title3 = `A third request to cancel ${RUN}`;
const title4 = `A dispute rehearsal piece ${RUN}`;
const brief =
  'A study of my golden retriever asleep on the porch, warm evening light, roughly 16 by 20. Painted for the e2e commission walk.';
const updateNote = `First wash of color is down — ${RUN}`;

/** The fixed cookie banner overlays bottom-of-page buttons (especially on the
 *  mobile project) — dismiss it the way a person does, once per context. */
async function acceptCookies(page: Page) {
  const cookie = page.getByRole('button', { name: 'Accept' });
  if (await cookie.isVisible().catch(() => false)) await cookie.click();
}

/** The commission panel is a desktop rail (<aside>, open by default) or a
 *  mobile bottom sheet behind the "Commission details" button. Returns the
 *  VISIBLE container — always scope panel assertions through it, because on
 *  phones the hidden rail still holds a duplicate copy of the content. */
async function openCommissionPanel(page: Page): Promise<Locator> {
  const rail = page.locator('aside').filter({ hasText: 'Brief' });
  await expect(rail).toBeAttached({ timeout: 20_000 });
  if (await rail.isVisible().catch(() => false)) return rail;
  await page.getByRole('button', { name: 'Commission details' }).click();
  const sheet = page.locator('div[role="dialog"]').filter({ hasText: 'Brief' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  return sheet;
}


/** The app caps commission WRITES at 5/min per IP (creation-spam guard, and
 *  correct for humans). The suite's writes come faster than any person's —
 *  keep a rolling window and pause so we never trip it. */
const commissionWrites: number[] = [];
async function paceCommissionWrites(page: Page) {
  for (;;) {
    const now = Date.now();
    while (commissionWrites.length && now - commissionWrites[0] > 62_000) commissionWrites.shift();
    // The bucket is 5 non-GET per 60s per IP on /api/commissions (middleware
    // LIMITS), and it covers every sub-route — accept, complete, confirm,
    // decline, updates, dispute. This counter only sees the writes the spec
    // makes deliberately, so the headroom has to absorb the ones it does not:
    // a UI click that posts on its own, a retry, a stray request from the
    // previous spec still inside the sliding window. Four left no room and
    // produced 429s on two different tests today.
    if (commissionWrites.length < 3) break;
    await page.waitForTimeout(62_000 - (now - commissionWrites[0]) + 500);
  }
  commissionWrites.push(Date.now());
}


/** POST a deliberately stale action and return the response, retrying once
 *  through the rate limiter.
 *
 *  `paceCommissionWrites` models the limiter as "fewer than 4 writes per 62s"
 *  and counts only this spec's own writes — but the limit is per-IP across
 *  every mutating route, so a spec that ran just before this one can leave the
 *  bucket short and the probe comes back 429 instead of the 409 it is
 *  asserting. Retrying keeps the assertion exact rather than widening it to
 *  "409 or 429", which would stop it noticing a route that silently succeeded.
 */
async function staleProbe(page: Page, path: string, body?: Record<string, unknown>) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await paceCommissionWrites(page);
    const res = await page.request.post(path, body ? { data: body } : undefined);
    if (res.status() !== 429) return res;
    await page.waitForTimeout(62_000);
  }
  await paceCommissionWrites(page);
  return page.request.post(path, body ? { data: body } : undefined);
}

/** Request a commission through the real journey: artist page → panel button →
 *  /commission-request form → lands in the new conversation. Returns the ids
 *  the API answered with (for stale-action probes and direct navigation). */
async function requestCommission(
  page: Page,
  slug: string,
  title: string
): Promise<{ id: string; conversationId: string }> {
  await page.goto(`/artist/${slug}`);
  await page.getByRole('button', { name: 'Request Commission' }).click();
  await expect(page).toHaveURL(/\/commission-request\?artist=/, { timeout: 20_000 });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill(brief);
  await page.getByLabel('Min Budget ($)').fill('200');
  await page.getByLabel('Max Budget ($)').fill('400');
  // Retried through the limiter, like the stale probes. The form is a real UI
  // click, so this cannot go through `staleProbe` — but a 429 here is the same
  // harness artifact and used to fail 11.12 outright.
  let res: import('@playwright/test').Response | null = null;
  for (let attempt = 0; attempt < 2 && (!res || res.status() === 429); attempt += 1) {
    if (res?.status() === 429) await page.waitForTimeout(62_000);
    await paceCommissionWrites(page);
    [res] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/commissions') && r.request().method() === 'POST',
        { timeout: 30_000 }
      ),
      page.getByRole('button', { name: 'Send Request' }).click(),
    ]);
  }
  expect(res!.status()).toBe(201);
  const body = await res!.json();
  expect(body.id).toBeTruthy();
  expect(body.conversation_id).toBeTruthy();
  // The form drops the buyer straight into the conversation with the artist.
  await expect(page).toHaveURL(new RegExp(`/messages/${body.conversation_id}`), { timeout: 20_000 });
  return { id: body.id, conversationId: body.conversation_id };
}

/** Artist quotes from the thread's panel. */
async function sendQuote(page: Page, conversationId: string, price: string, timeline: string) {
  await page.goto(`/messages/${conversationId}`);
  const panel = await openCommissionPanel(page);
  await panel.getByRole('button', { name: 'Send Quote' }).click();
  await panel.getByLabel('Estimated Completion').fill(timeline);
  await panel.getByLabel('Your Price ($)').fill(price);
  // Two "Send Quote" buttons once the form is open; the form's is last in DOM.
  await paceCommissionWrites(page);
  await panel.getByRole('button', { name: 'Send Quote' }).last().click();
  // Durable state, not the auto-dismissing toast: the panel shows the quote.
  await expect(panel.getByText('Artist Quote')).toBeVisible({ timeout: 15_000 });
}

test.describe.serial('part 11 — commissions', () => {
  test.skip(!ready, 'E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD / E2E_SMALL_IMAGE not configured');

  // Several steps hop role → navigate → act → assert; give them room.
  test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(120_000));

  let loverContext: BrowserContext;
  let loverPage: Page;
  let artistContext: BrowserContext;
  let artistPage: Page;

  let artistSlug: string;
  let commission1: { id: string; conversationId: string };
  let commission2: { id: string; conversationId: string };
  let commission3: { id: string; conversationId: string };
  let commission4: { id: string; conversationId: string };

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

  test('artist prep: signed in, away mode off, commissions open, slug captured', async () => {
    const page = artistPage;
    await page.goto('/login');
    await acceptCookies(page);
    await login(page, artist.email!, artist.password!);

    // A previous aborted run may have left away mode on — clear it first,
    // since turning it off is also what restores commissions_open.
    // The Away card renders only after its own profile fetch; under
    // back-to-back-run throttling that fetch can strand — reload like a
    // person would (the standard recovery pattern in this suite).
    await page.goto('/studio');
    const awayHeading = page.getByRole('heading', { name: 'Away mode' });
    await expect(async () => {
      if (!(await awayHeading.isVisible().catch(() => false))) await page.reload();
      await expect(awayHeading).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    const awayOff = page.getByRole('button', { name: 'Turn off away mode' });
    if (await awayOff.isVisible().catch(() => false)) {
      await awayOff.click();
      await expect(page.getByText(/welcome back — your shop is live again/i)).toBeVisible({ timeout: 15_000 });
    }

    // Commissions must be open on the public profile for 11.1 to exist.
    await page.goto('/studio/page');
    const openBox = page.getByLabel('Open to commissions');
    await openBox.waitFor({ state: 'visible', timeout: 20_000 });
    await openBox.check();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText(/profile updated successfully/i)).toBeVisible({ timeout: 15_000 });

    const preview = await page.getByRole('link', { name: /preview as visitor/i }).getAttribute('href');
    artistSlug = preview!.match(/\/artist\/([^?]+)/)![1];
    expect(artistSlug).toBeTruthy();
  });

  test('a fresh art lover registers through the real form', async () => {
    const page = loverPage;
    await page.goto('/register');
    await acceptCookies(page);
    await page.getByLabel('Full Name').fill(loverName);
    await page.getByLabel('Email').fill(loverEmail);
    await page.getByLabel('Password').fill(loverPassword);
    await page.getByRole('button', { name: 'Art Lover' }).click();
    await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();
    // Autoconfirm: the session lands immediately (no dead confirmation screen).
    await expect(page).not.toHaveURL(/\/register/, { timeout: 20_000 });
    // Prove the session is real: an authed-only route renders instead of bouncing.
    await page.goto('/messages');
    await expect(page.getByText('No messages yet')).toBeVisible({ timeout: 20_000 });
  });

  test('11.1 lover requests a commission — empty submit refused first', async () => {
    const page = loverPage;
    await page.goto(`/artist/${artistSlug}`);
    // The public commission panel invites the request.
    await expect(page.getByText('Commissions Open')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Request Commission' }).click();
    await expect(page).toHaveURL(/\/commission-request\?artist=/, { timeout: 20_000 });

    // Empty submit: the form says what's needed.
    await page.getByRole('button', { name: 'Send Request' }).click();
    await expect(page.getByText('Title must be at least 2 characters')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Enter a number').first()).toBeVisible();

    // Fill it in for real (helper re-walks artist page → form → thread).
    commission1 = await requestCommission(page, artistSlug, title1);

    // The buyer lands IN the conversation, panel showing the new request.
    const panel = await openCommissionPanel(page);
    await expect(panel.getByText(title1)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('New request', { exact: true }).first()).toBeVisible();
    await expect(panel.getByText('Budget: $200.00 – $400.00')).toBeVisible();

    // And the inbox has a Commissions section carrying the thread.
    await page.goto('/messages?tab=commissions');
    await expect(page.getByText('New request', { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('11.2 artist sees the request with brief, budget, and actions', async () => {
    const page = artistPage;
    await page.goto('/messages?tab=commissions');
    const row = page
      .locator('a[href^="/messages/"]')
      .filter({ hasText: loverName })
      .filter({ hasText: 'New request' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/messages/${commission1.conversationId}`), { timeout: 20_000 });

    const panel = await openCommissionPanel(page);
    await expect(panel.getByText(title1)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Budget: $200.00 – $400.00')).toBeVisible();
    await expect(panel.getByText(brief)).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Send Quote' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Decline' })).toBeVisible();

    // P5: the request also produces an in-app notification for the artist
    // (used to be email-only) linking into the conversation.
    await page.goto('/notifications');
    const requestNotif = page.getByText('New commission request').first();
    await expect(async () => {
      if (!(await requestNotif.isVisible().catch(() => false))) await page.reload();
      await expect(requestNotif).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.getByText(`"${title1}"`, { exact: false }).first()).toBeVisible();
  });

  test('11.3 artist sends a quote — nonsense price refused first', async () => {
    const page = artistPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(page);
    await panel.getByRole('button', { name: 'Send Quote' }).click();
    await panel.getByLabel('Estimated Completion').fill('4 weeks');

    // A negative price is refused politely (type=number blocks 'abc' outright).
    await panel.getByLabel('Your Price ($)').fill('-50');
    await paceCommissionWrites(page);
  await panel.getByRole('button', { name: 'Send Quote' }).last().click();
    await expect(page.getByText('Please provide a valid price and timeline.')).toBeVisible({ timeout: 10_000 });

    // The real quote: $300, four weeks.
    await panel.getByLabel('Your Price ($)').fill('300');
    await paceCommissionWrites(page);
  await panel.getByRole('button', { name: 'Send Quote' }).last().click();

    // The quote lives in the conversation itself, not just the panel…
    await expect(page.getByText('Commission quote').first()).toBeVisible({ timeout: 15_000 });
    // …and the panel carries the quote card.
    await expect(panel.getByText('Artist Quote')).toBeVisible();
    await expect(panel.getByText('$300.00')).toBeVisible();
    await expect(panel.getByText('Estimated completion: 4 weeks')).toBeVisible();
  });

  test('11.4 lover accepts the quote — in progress straight away, everywhere', async () => {
    const page = loverPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(page);
    await expect(panel.getByText('Quoted', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Artist Quote')).toBeVisible();
    await paceCommissionWrites(page);
    await panel.getByRole('button', { name: 'Accept Quote' }).click();
    // No reload: the panel flips immediately.
    await expect(panel.getByText('In progress', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    // And the inbox pill agrees.
    await page.goto('/messages?tab=commissions');
    await expect(page.getByText('In progress', { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('11.4b the in-thread quote card survives a reload — no second Accept', async () => {
    // A tester on prod reported "not letting me accept quote" on a commission
    // the database showed as already in progress. The card kept its
    // accepted/declined state in local component state, so a reload put Accept
    // and Decline back on a quote already accepted; pressing it 409'd, and the
    // caller threw the 409's sentence away and showed "Action failed. Try
    // again." The whole experience of an accepted commission was a button that
    // never worked.
    const page = loverPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    // The thread's own quote card, not the panel's.
    const card = page.locator('div').filter({ hasText: /^Commission quote/ }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('Accepted')).toBeVisible({ timeout: 15_000 });
    await expect(card.getByRole('button', { name: 'Accept' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Decline' })).toHaveCount(0);
  });

  test('11.5 artist posts a progress update with a photo and a percent', async () => {
    const page = artistPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(page);
    await panel.getByPlaceholder(/quick progress update/i).fill(updateNote);
    await panel.locator('input[type=file]').setInputFiles(smallImage!);
    await expect(panel.locator('img[alt="Update photo"]')).toBeVisible({ timeout: 30_000 });
    await panel.getByPlaceholder('optional').fill('40');
    await panel.getByRole('button', { name: 'Post update' }).click();
    await expect(page.getByText(/update posted — the buyer has been notified/i)).toBeVisible({ timeout: 20_000 });
    // The update lands in the panel's timeline with its progress chip…
    await expect(panel.getByText(updateNote)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByText('Overall progress')).toBeVisible();
    await expect(panel.getByText('40%').first()).toBeVisible();
    // …and is mirrored into the conversation as a message.
    await expect(page.getByText(/Progress update \(40% complete\)/).first()).toBeVisible({ timeout: 15_000 });
  });

  test('11.6 lover is notified and the notification lands in the conversation', async () => {
    const page = loverPage;
    await page.goto('/notifications');
    const note = page.getByText('Commission update').first();
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/posted an update on/).first()).toBeVisible();
    await note.click();
    await expect(page).toHaveURL(new RegExp(`/messages/${commission1.conversationId}`), { timeout: 20_000 });
    const panel = await openCommissionPanel(page);
    await expect(panel.getByText(updateNote)).toBeVisible({ timeout: 15_000 });
  });

  test('11.7 artist marks the commission delivered', async () => {
    const page = artistPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(page);
    await paceCommissionWrites(page);
    await panel.getByRole('button', { name: 'Mark as Delivered' }).click();
    await expect(panel.getByText('Delivered', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('11.8 lover confirms receipt — closed as completed', async () => {
    const page = loverPage;
    await page.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(page);
    await expect(panel.getByText('Delivered', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole('button', { name: 'Report Issue' })).toBeVisible();
    await paceCommissionWrites(page);
    const [confirmRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/confirm') && r.request().method() === 'POST',
        { timeout: 15_000 }
      ),
      panel.getByRole('button', { name: 'Confirm Receipt' }).click(),
    ]);
    expect(confirmRes.status(), await confirmRes.text()).toBe(200);
    await expect(panel.getByText('Closed — completed').first()).toBeVisible({ timeout: 15_000 });
    // No stale action buttons survive the close.
    await expect(panel.getByRole('button', { name: 'Decline' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Confirm Receipt' })).toHaveCount(0);
  });

  test('11.9 stale actions are refused with a conflict, not a silent change', async () => {
    // The commission is confirmed. Every out-of-order action must 409 with a
    // clear message (the exact copy each route ships).
    const quoteAgain = await staleProbe(artistPage, `/api/commissions/${commission1.id}/accept`, {
      quoted_price_cents: 30_000,
      estimated_completion: '4 weeks',
    });
    expect(quoteAgain.status()).toBe(409);
    expect((await quoteAgain.json()).error).toBe('Only new requests can be quoted.');

    const deliverAgain = await staleProbe(artistPage, `/api/commissions/${commission1.id}/complete`);
    expect(deliverAgain.status()).toBe(409);
    expect((await deliverAgain.json()).error).toBe('Only in-progress commissions can be delivered.');

    const confirmAgain = await staleProbe(loverPage, `/api/commissions/${commission1.id}/confirm`);
    expect(confirmAgain.status()).toBe(409);
    expect((await confirmAgain.json()).error).toBe('This commission is not awaiting your confirmation.');

    const declineLate = await staleProbe(loverPage, `/api/commissions/${commission1.id}/decline`);
    expect(declineLate.status()).toBe(409);
    expect((await declineLate.json()).error).toBe('This commission can no longer be cancelled.');

    // And the status did not corrupt: still closed as completed.
    await loverPage.goto(`/messages/${commission1.conversationId}`);
    const panel = await openCommissionPanel(loverPage);
    await expect(panel.getByText('Closed — completed').first()).toBeVisible({ timeout: 15_000 });
  });

  test('11.10 a second request the artist declines, with a reason the buyer sees', async () => {
    commission2 = await requestCommission(loverPage, artistSlug, title2);

    // P6: Decline opens a form with an optional note; the state is labelled
    // "Declined by artist" (not a bare "Closed") on both sides.
    await artistPage.goto(`/messages/${commission2.conversationId}`);
    const artistPanel = await openCommissionPanel(artistPage);
    await expect(artistPanel.getByText(title2)).toBeVisible({ timeout: 15_000 });
    await paceCommissionWrites(artistPage);
    await artistPanel.getByRole('button', { name: 'Decline', exact: true }).click();
    await artistPanel.getByLabel(/note for the requester/i).fill(`Commission list is full — ${RUN}`);
    await artistPanel.getByRole('button', { name: 'Decline request' }).click();
    await expect(artistPanel.getByText('Declined by artist').first()).toBeVisible({ timeout: 15_000 });

    // The buyer sees the declined state AND the artist's note.
    await loverPage.goto(`/messages/${commission2.conversationId}`);
    const loverPanel = await openCommissionPanel(loverPage);
    await expect(loverPanel.getByText('Declined by artist').first()).toBeVisible({ timeout: 15_000 });
    await expect(loverPanel.getByText(`Commission list is full — ${RUN}`)).toBeVisible();
    await expect(loverPanel.getByRole('button', { name: 'Accept Quote' })).toHaveCount(0);
  });

  test('11.11 a third request the lover cancels before any quote', async () => {
    commission3 = await requestCommission(loverPage, artistSlug, title3);
    const panel = await openCommissionPanel(loverPage);
    await expect(panel.getByText('New request', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await paceCommissionWrites(loverPage);
    await panel.getByRole('button', { name: 'Cancel Request' }).click();
    // R9: Cancel Request is destructive and now confirms first (03-P2).
    await loverPage.getByRole('dialog').getByRole('button', { name: 'Cancel request' }).click();
    // P6: the requester's own cancel is labelled as theirs.
    await expect(panel.getByText('Cancelled by you').first()).toBeVisible({ timeout: 15_000 });
  });

  test('11.12 report an issue on a delivered commission', async () => {
    // A fresh commission walked to delivered, so the dispute poisons nothing.
    commission4 = await requestCommission(loverPage, artistSlug, title4);
    await sendQuote(artistPage, commission4.conversationId, '250', '3 weeks');

    await loverPage.goto(`/messages/${commission4.conversationId}`);
    let loverPanel = await openCommissionPanel(loverPage);
    await paceCommissionWrites(loverPage);
    await loverPanel.getByRole('button', { name: 'Accept Quote' }).click();
    await expect(loverPanel.getByText('In progress', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await artistPage.goto(`/messages/${commission4.conversationId}`);
    const artistPanel = await openCommissionPanel(artistPage);
    await paceCommissionWrites(artistPage);
    await artistPanel.getByRole('button', { name: 'Mark as Delivered' }).click();
    await expect(artistPanel.getByText('Delivered', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await loverPage.goto(`/messages/${commission4.conversationId}`);
    loverPanel = await openCommissionPanel(loverPage);
    await loverPanel.getByRole('button', { name: 'Report Issue' }).click();
    await loverPanel.getByLabel('What went wrong?').fill(
      `The piece arrived with a torn corner — filed by the e2e walk (${RUN}).`
    );
    await paceCommissionWrites(loverPage);
    await loverPanel.getByRole('button', { name: 'Submit' }).click();
    await expect(loverPanel.getByText('Disputed', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });

  test('11.13 away mode pauses commissions, and coming back restores them', async () => {
    // Artist goes away.
    await artistPage.goto('/studio');
    await expect(artistPage.getByRole('heading', { name: 'Away mode' })).toBeVisible({ timeout: 20_000 });
    await artistPage.getByRole('button', { name: 'Set my shop to away' }).click();
    await expect(artistPage.getByText(/away mode on — your shop is paused/i)).toBeVisible({ timeout: 15_000 });

    // The public page holds commission requests while away.
    await loverPage.goto(`/artist/${artistSlug}`);
    await expect(loverPage.getByText('Not accepting commissions at this time.')).toBeVisible({ timeout: 20_000 });
    await expect(loverPage.getByRole('button', { name: 'Request Commission' })).toHaveCount(0);

    // Back again — and commissions reopen (away restores the prior setting).
    await artistPage.getByRole('button', { name: 'Turn off away mode' }).click();
    await expect(artistPage.getByText(/welcome back — your shop is live again/i)).toBeVisible({ timeout: 15_000 });

    await loverPage.goto(`/artist/${artistSlug}`);
    await expect(loverPage.getByText('Commissions Open')).toBeVisible({ timeout: 20_000 });
    await expect(loverPage.getByRole('button', { name: 'Request Commission' })).toBeVisible();
  });

  test('11.14 old commission links land in the commissions inbox, not a crash', async () => {
    const page = loverPage;
    // The plan's literal step: the bare /commissions URL.
    await page.goto('/commissions');
    await expect(page).toHaveURL(/\/messages\?tab=commissions/, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Commissions' })).toBeVisible({ timeout: 20_000 });

    // A stale/bogus deep link forwards to the same safe place (the [id]
    // redirect falls back to the inbox when the commission doesn't exist).
    await page.goto('/commissions/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL(/\/messages\?tab=commissions/, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Commissions' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/application error/i)).toHaveCount(0);
  });
});
