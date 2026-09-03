import { test, expect, Page, BrowserContext } from '@playwright/test';
import { fetchAvailableListings, fetchLiveArtists } from './helpers/data';

/**
 * Parts 9 + 10 of the live test plan: the full money loop on Stripe TEST mode.
 * The artist creates a $20 + $5-shipping listing through the real UI, a fresh
 * buyer pays with the 4242 test card on Stripe's hosted page, and the order
 * walks paid → shipped → delivered → reviewed → refund requested → artist
 * approves → admin settles → the piece is back on the market.
 *
 * Requires (staging = Stripe TEST + payments enabled):
 *   E2E_ARTIST_EMAIL / E2E_ARTIST_PASSWORD  — the Stripe-onboarded live artist
 *   E2E_ADMIN_EMAIL  / E2E_ADMIN_PASSWORD
 *   E2E_MONEY=1                              — opt-in: this spec mutates orders
 *
 * Not covered here (inherently human, flagged for the prod tester): the bank
 * statement reading CUSTOM CANVAS, the confirmation/sale/shipped emails, and
 * the real refund landing back on a card.
 */

const artist = { email: process.env.E2E_ARTIST_EMAIL, password: process.env.E2E_ARTIST_PASSWORD };
const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const optedIn = process.env.E2E_MONEY === '1';
const ready = !!(optedIn && artist.email && artist.password && admin.email && admin.password);

const RUN = Date.now().toString(36);
const listingTitle = `RT2 Morning in Montrose ${RUN}`;
const buyerEmail = `e2e.buyer.${RUN}@customcanvas.dev`;
const buyerPassword = `Buy-${RUN}-pass`;

async function dismissCookies(page: Page) {
  const accept = page.getByRole('button', { name: 'Accept' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await dismissCookies(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

test.describe.serial('purchase and refund (Stripe test mode)', () => {
  test.skip(!ready, 'set E2E_MONEY=1 + artist/admin creds against the Stripe-test staging target');

  let artistContext: BrowserContext;
  let artistPage: Page;
  let buyerContext: BrowserContext;
  let buyerPage: Page;
  let listingId: string;
  let orderShort: string;

  test.beforeAll(async ({ browser }) => {
    artistContext = await browser.newContext();
    artistPage = await artistContext.newPage();
    buyerContext = await browser.newContext();
    buyerPage = await buyerContext.newPage();
  });
  test.afterAll(async () => {
    await artistContext?.close();
    await buyerContext?.close();
  });

  test('artist lists the piece at $20 + $5 shipping', async () => {
    const page = artistPage;
    await login(page, artist.email!, artist.password!);
    await page.goto('/listings/new');
    await page.getByLabel('Title').fill(listingTitle);
    await page.getByLabel('Medium').fill('Oil on canvas');
    await page.getByLabel('Price ($)').fill('20');
    await page.getByLabel('Shipping rate ($)').fill('5');
    // Give it a real image — imageless cards pollute the shared staging feed
    // (and confused the visitor spec's title harvesting once already).
    if (process.env.E2E_SMALL_IMAGE) {
      await page.locator('input[type=file]').setInputFiles(process.env.E2E_SMALL_IMAGE);
      await expect(page.locator('img[alt="Listing image"]').first()).toBeVisible({ timeout: 30_000 });
    }
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });

    // Resolve the listing id from the public rows (the artist is live).
    await expect
      .poll(
        async () => {
          const listings = await fetchAvailableListings(page.request);
          const mine = listings.find((l) => l.title === listingTitle);
          if (mine) listingId = mine.id;
          return !!mine;
        },
        { timeout: 20_000 }
      )
      .toBe(true);
  });

  test('checkout shows the exact money: 20 + 5 + 1.06 = 26.06', async () => {
    const page = buyerPage;
    await page.goto('/register');
    await dismissCookies(page);
    await page.getByLabel('Full Name').fill('RT2 Buyer');
    await page.getByLabel('Email').fill(buyerEmail);
    await page.getByLabel('Password').fill(buyerPassword);
    await page.getByRole('button', { name: 'Art Lover' }).click();
    await page.getByText(/18 or older and agree to the/).locator('..').locator('input[type=checkbox]').check();
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).not.toHaveURL(/\/register/, { timeout: 20_000 });

    await page.goto(`/listing/${listingId}`);
    // L3: the seller of record is named on the listing before the buyer ever
    // reaches checkout (ToSale §1, ToS §4, AA §1). Harvest the name here and
    // assert checkout agrees, rather than hardcoding the seed artist's.
    const soldBy = await page.getByText(/Sold by/).first().innerText();
    const sellerName = soldBy.replace(/^Sold by\s*/i, '').split('·')[0].trim();
    expect(sellerName.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: /buy now/i }).click();
    await expect(page).toHaveURL(/\/checkout\//, { timeout: 20_000 });

    // Part 9.2 — the plan's table, exactly.
    const row = (label: string) => page.locator('div.flex.justify-between', { hasText: label });
    await expect(row('Price')).toContainText('$20.00');
    await expect(row('Shipping')).toContainText('$5.00');
    await expect(page.getByText('$1.06')).toBeVisible();
    await expect(row('Total')).toContainText('$26.06');
    await expect(page.getByText(/service fee covers payment processing/i)).toBeVisible();
    // L3 — the seller of record is named before the buyer pays (ToSale §1).
    await expect(row('Seller')).toContainText(sellerName);

    // Part 9.3 — the small print. L1 gave the Terms of Sale their own page;
    // this link pointed at the Terms of Service until then.
    await expect(page.getByRole('link', { name: /^terms of sale$/i })).toHaveAttribute('href', '/terms-of-sale');
    await expect(page.getByRole('link', { name: /shipping, returns/i })).toHaveAttribute('href', '/shipping-returns');
    await expect(page.getByText('CUSTOM CANVAS', { exact: true })).toBeVisible();
    // L6's rule, disclosed at the point of sale rather than the old flat
    // "non-refundable service fee".
    await expect(page.getByText(/service fee is not refunded on a\s+change-of-mind return/i)).toBeVisible();
  });

  test('buyer pays with the Stripe test card', async () => {
    test.setTimeout(180_000);
    const page = buyerPage;
    await page.getByRole('button', { name: /^pay/i }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 45_000 });

    const field = (name: string) => page.locator(`input[name="${name}"]`).first();
    await field('email').waitFor({ state: 'visible', timeout: 30_000 });
    if (!(await field('email').inputValue())) await field('email').fill(buyerEmail);

    // Stripe collects the delivery address (tax is sourced from it).
    const fillIfPresent = async (name: string, value: string) => {
      const f = field(name);
      if (await f.isVisible().catch(() => false)) await f.fill(value);
    };
    const fillAddress = async (prefix: string) => {
      await fillIfPresent(`${prefix}Name`, 'RT2 Buyer');
      await fillIfPresent(`${prefix}AddressLine1`, '3120 Southwest Freeway');
      await fillIfPresent(`${prefix}Locality`, 'Houston');
      await fillIfPresent(`${prefix}PostalCode`, '77098');
      // The state is a <select>, not an input — easy to miss.
      const state = page.locator(`select[name="${prefix}AdministrativeArea"]`).first();
      if (await state.isVisible().catch(() => false)) await state.selectOption('TX');
    };
    // A collapsed address form may need the manual-entry link first.
    const manual = page.getByText(/enter address manually/i);
    if (await manual.isVisible().catch(() => false)) await manual.click();
    await fillAddress('shipping');
    await fillIfPresent('phoneNumber', '7135550123');

    const cardRadio = page.getByRole('radio', { name: /card/i }).first();
    if (await cardRadio.isVisible().catch(() => false)) await cardRadio.click({ force: true });
    await field('cardNumber').waitFor({ state: 'visible', timeout: 20_000 });
    await field('cardNumber').fill('4242424242424242');
    await field('cardExpiry').fill('12/34');
    await field('cardCvc').fill('123');
    // Billing defaults to "use shipping as billing"; fill it only when shown.
    await fillAddress('billing');
    await fillIfPresent('billingName', 'RT2 Buyer');
    // Don't enroll in Link — it adds an SMS step no automation can pass.
    const linkPass = page.locator('input[name="enableStripePass"]');
    if (await linkPass.isChecked().catch(() => false)) await linkPass.uncheck().catch(() => {});

    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/orders\?success=true/, { timeout: 90_000 });
    await expect(page.getByText(/your purchase was successful/i)).toBeVisible({ timeout: 15_000 });

    // The order row lands via the Stripe webhook — poll until it shows Paid.
    // Each iteration must WAIT for the client fetch to render, not sample
    // visibility the instant the page load event fires.
    await expect
      .poll(
        async () => {
          await page.goto('/orders');
          return page
            .getByText('Paid', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 8000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 120_000, intervals: [2000] }
      )
      .toBe(true);
    // The charged total includes Stripe tax, so amounts aren't deterministic —
    // key every later lookup on the order number instead.
    const orderText = await page.getByText(/^Order #/).first().textContent();
    orderShort = orderText!.replace('Order #', '').trim();
    expect(orderShort).toMatch(/^[0-9a-f]{8}$/);
  });

  test('the piece is off the market for everyone else', async ({ browser }) => {
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await expect
      .poll(
        async () => {
          await page.goto(`/listing/${listingId}`);
          const sold = await page.getByText(/sold|no longer available/i).first().isVisible().catch(() => false);
          const buyable = await page.getByRole('button', { name: /buy now/i }).isVisible().catch(() => false);
          return sold && !buyable;
        },
        { timeout: 60_000, intervals: [3000] }
      )
      .toBe(true);
    await anon.close();
  });

  test('artist sees the sale: $22.00 payout, then ships it', async () => {
    const page = artistPage;
    await page.goto('/studio/sales');
    const orderCard = page.locator('div.rounded-xl', { hasText: orderShort }).first();
    await expect(orderCard).toBeVisible({ timeout: 30_000 });
    await expect(orderCard.getByText('You receive: $22.00')).toBeVisible();
    await expect(orderCard.getByText('Paid', { exact: true })).toBeVisible();

    // 9.13 — Ship Order modal validates carrier + tracking.
    await orderCard.getByRole('button', { name: /mark as shipped/i }).click();
    await expect(page.getByRole('heading', { name: /ship order/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /confirm shipment/i })).toBeDisabled();
    await page.locator('select#carrier').selectOption('usps');
    await page.getByLabel('Tracking Number').fill('9400111899223197428490');
    await page.getByRole('button', { name: /confirm shipment/i }).click();
    await expect(page.getByText(/order marked as shipped/i)).toBeVisible({ timeout: 15_000 });
    await expect(orderCard.getByText('Shipped', { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test('buyer sees the tracking; artist marks delivered; buyer reviews', async () => {
    await buyerPage.goto('/orders');
    await expect(buyerPage.getByText('9400111899223197428490')).toBeVisible({ timeout: 15_000 });
    await expect(buyerPage.getByText('Shipped', { exact: true }).first()).toBeVisible();

    // 9.15 — delivered.
    const page = artistPage;
    await page.goto('/studio/sales');
    const orderCard = page.locator('div.rounded-xl', { hasText: orderShort }).first();
    await orderCard.getByRole('button', { name: /mark delivered/i }).click();
    await expect(page.getByText(/order marked as delivered/i)).toBeVisible({ timeout: 15_000 });

    // 9.16 — review.
    await buyerPage.goto('/orders');
    const buyerOrder = buyerPage.locator('div.rounded-lg', { hasText: orderShort }).first();
    await buyerOrder.getByRole('button', { name: /leave a review/i }).click();
    await buyerPage.getByRole('button', { name: '5 stars' }).click();
    await buyerPage.locator('#review-comment').fill(`Arrived fast and even better in person (${RUN}).`);
    await buyerPage.getByRole('button', { name: /submit review/i }).click();
    await expect(buyerPage.getByText(/review submitted/i).first()).toBeVisible({ timeout: 15_000 });
    // The review is displayed on the artist's public page.
    const artists = await fetchLiveArtists(buyerPage.request);
    const seller = artists.find((a) => a.stripe_onboarded);
    await buyerPage.goto(`/artist/${seller!.slug}`);
    await expect(buyerPage.getByText(`Arrived fast and even better in person (${RUN}).`)).toBeVisible({ timeout: 15_000 });
  });

  test('buyer requests a refund; it opens a prefilled conversation', async () => {
    const page = buyerPage;
    await page.goto('/orders');
    const order = page.locator('div.rounded-lg', { hasText: orderShort }).first();
    await order.getByRole('button', { name: /request a refund/i }).click();
    await page.waitForURL(/\/messages\//, { timeout: 20_000 });
    const composer = page.locator('textarea').first();
    await expect(composer).toHaveValue(/request a refund for my order #/i, { timeout: 15_000 });
    await composer.fill((await composer.inputValue()) + 'It does not fit my wall after all.');
    await composer.press('Enter');
    await expect(page.getByText(/request a refund for my order/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('artist approves the refund (cancel first, then approve)', async () => {
    const page = artistPage;
    await page.goto('/studio/sales');
    const orderCard = page.locator('div.rounded-xl', { hasText: orderShort }).first();
    await orderCard.getByRole('button', { name: /approve refund/i }).click();
    // 10.3 — the confirm box spells out what happens; Cancel aborts.
    await expect(page.getByText(/your payout for this sale is returned/i)).toBeVisible();
    await page.getByRole('button', { name: /^cancel$/i }).click();
    await expect(orderCard.getByRole('button', { name: /approve refund/i })).toBeVisible();

    await orderCard.getByRole('button', { name: /approve refund/i }).click();
    await page.getByRole('button', { name: /approve refund/i }).last().click();
    await expect(page.getByText(/custom canvas (will settle|is settling)/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('buyer sees "settling"; admin settles; everyone shows Refunded', async ({ browser }) => {
    await buyerPage.goto('/orders');
    await expect(buyerPage.getByText(/custom canvas is settling your payment/i)).toBeVisible({ timeout: 15_000 });

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, admin.email!, admin.password!);
    await page.goto('/admin/orders');
    const row = page.locator('tr', { hasText: orderShort }).first();
    await expect(row.getByRole('button', { name: /settle refund/i })).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /settle refund/i }).click();

    // L6 — settling now asks WHY first, because the reason decides the split.
    const dialog = page.getByRole('dialog', { name: /refund this order/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const reason = dialog.getByLabel(/why is this being refunded/i);

    // The artist approved a discretionary return, so change of mind is the
    // default and the $1.06 fee is retained: $27.06 of the $28.21 charge.
    await expect(reason).toHaveValue('change_of_mind');
    await expect(dialog.getByText(/\$1\.06 retained/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /refund \$27\.06/i })).toBeVisible();

    // Switch to a fault reason and the WHOLE charge goes back, fee included
    // (Terms of Sale §2, Artist Agreement §8). Asserted here rather than
    // settled: a real fault refund needs its own order, and Section D's
    // first live purchase walks one by hand.
    await reason.selectOption('not_as_described');
    await expect(dialog.getByText(/\$1\.06 returned/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /refund \$28\.21/i })).toBeVisible();
    await expect(dialog.getByText(/whole charge goes back/i)).toBeVisible();

    // Back to the reason this order actually has, and settle it.
    await reason.selectOption('change_of_mind');
    await dialog.getByRole('button', { name: /refund \$27\.06/i }).click();
    await page.getByRole('button', { name: /refund buyer/i }).click();
    await expect(page.getByText(/refund settled/i)).toBeVisible({ timeout: 30_000 });

    // 10.9 — no second settle: the button is gone from the refunded row.
    await page.goto('/admin/orders');
    const refundedRow = page.locator('tr', { hasText: orderShort }).first();
    await expect(refundedRow.getByText(/refunded/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(refundedRow.getByRole('button', { name: /settle refund/i })).toHaveCount(0);
    // L6: the row says which split was applied.
    await expect(refundedRow.getByText(/change of mind — service fee retained/i)).toBeVisible();
    await ctx.close();

    await buyerPage.goto('/orders');
    await expect(buyerPage.getByText('Refunded', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    // L6: the buyer is told whether the service fee came back, unprompted.
    await expect(
      buyerPage.getByText(/change of mind — service fee retained/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await artistPage.goto('/studio/sales');
    await expect(
      artistPage.locator('div.rounded-xl', { hasText: orderShort }).first().getByText('Refunded', { exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('shipped-then-refunded pieces do NOT auto-relist; the artist relists manually', async ({ browser }) => {
    // Plan 10.7 expected an automatic return to market, but the app
    // deliberately relists only never-shipped orders — a shipped piece is
    // physically with the buyer, so the artist relists after the return
    // (comment in api/admin/orders/[id]/refund). Assert the real behavior,
    // then walk the manual relist.
    const anon = await browser.newContext();
    const page = await anon.newPage();
    await page.goto(`/listing/${listingId}`);
    await expect(page.getByRole('button', { name: /buy now/i })).toHaveCount(0);

    await artistPage.goto(`/listings/${listingId}/edit`);
    // The status dropdown is the bare select at the bottom of the edit form.
    const status = artistPage.locator('form select').last();
    await status.waitFor({ state: 'visible', timeout: 15_000 });
    await status.selectOption('available');
    await artistPage.getByRole('button', { name: /save changes/i }).click();
    await expect(artistPage).toHaveURL(/\/studio\/work/, { timeout: 20_000 });

    await expect
      .poll(
        async () => {
          await page.goto(`/listing/${listingId}`);
          return page
            .getByRole('button', { name: /buy now/i })
            .waitFor({ state: 'visible', timeout: 5000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 30_000, intervals: [2000] }
      )
      .toBe(true);
    await anon.close();

    // Leave the shared staging feed tidy: hide this run's listing.
    await artistPage.goto(`/listings/${listingId}/edit`);
    const cleanupStatus = artistPage.locator('form select').last();
    await cleanupStatus.waitFor({ state: 'visible', timeout: 15_000 });
    await cleanupStatus.selectOption('hidden');
    await artistPage.getByRole('button', { name: /save changes/i }).click();
    await expect(artistPage).toHaveURL(/\/studio\/work/, { timeout: 20_000 });
  });
});
