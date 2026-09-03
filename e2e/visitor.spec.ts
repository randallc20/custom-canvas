import { test, expect, Page } from '@playwright/test';

/**
 * Anonymous-visitor walk of the live test plan (docs/LIVE-TEST-PLAN.md):
 *   Part 3 — The Visitor: an empty site (adapted: staging is populated, so
 *   every "should say something friendly about being empty" step asserts the
 *   populated equivalent renders sanely instead), and
 *   Part 7 — The Visitor again: now there's art.
 *
 * Read-only, no login, no account creation; every test is independent and gets
 * a fresh browser context (so the cookie banner appears each time — dismissed
 * via the helper below before interacting).
 *
 * Data-independence: staging has ~12 live artists and their listings, but the
 * exact titles/artists vary — assertions are structural (at least N cards, the
 * real headings and empty-state copy from src/components), never on specific
 * artwork. Search terms are harvested from whatever the feed actually shows.
 *
 * Plan step mapping:
 *   3.1/3.2/7.1  front door renders (hero, cards, no debris)
 *   3.3          location picker (set, persist, clear)
 *   3.4/7.5      nonsense + forgiving search
 *   3.5          footer walk (About/Terms/Terms of Sale/Shipping/Privacy/DMCA
 *                + Partners page) and the eight published legal documents (L1)
 *   3.6          about-page fee copy (~3% service fee, no 15%/85-15 split)
 *   3.7          guarded routes bounce to /login with returnUrl
 *   3.8          cookie banner
 *   3.9          no sideways scroll (mobile project covers the narrow window)
 *   3.10         /galleries -> /partners redirect
 *   7.2/7.4      sort + filters (URL-driven so they run on mobile too)
 *   7.3          Art / Artists tabs
 *   7.6          search suggestions (desktop navbar)
 *   7.7/7.8/7.10 listing page: carousel, price, fee line, buy -> login, related
 *   7.11         artist public page from the listing
 *   7.12         nonsense addresses render the 404 page
 * Skipped (not automatable / not visitor-scoped): 7.9 share-link preview card
 * (needs a messaging app), geolocation + ZIP lookups (external services — the
 * city-input path covers the picker), Part 7 checks of Nora-specific content.
 */

const LOAD = { timeout: 15_000 };

/** Every fresh context shows the fixed cookie banner; dismiss it the way a
 *  person does before touching anything else (it overlays bottom UI). */
async function dismissCookies(page: Page) {
  const accept = page.getByRole('button', { name: 'Accept', exact: true });
  try {
    await accept.click({ timeout: 10_000 });
  } catch {
    /* already dismissed or not rendered — fine */
  }
}

/** The Discover masonry grid inside the home feed (shelves render separate,
 *  unsorted rows — sort/filter assertions must not read those). */
function discoverCards(page: Page) {
  return page.locator('#feed .columns-2 a[href^="/listing/"]');
}

/** Open the location modal from wherever the picker lives in this viewport:
 *  desktop navbar pill, the hero "Choose your city" button, or (mobile, once a
 *  location is set and the hero variant is gone) inside the hamburger menu. */
async function openLocationModal(page: Page) {
  const anyVisible = page.locator('button[aria-label="Choose your location"]:visible');
  if ((await anyVisible.count()) === 0) {
    await page.locator('nav button.md\\:hidden').click();
  }
  await page.locator('button[aria-label="Choose your location"]:visible').first().click();
  await expect(page.getByText('Where should we look for art?')).toBeVisible(LOAD);
}

/** Harvest a real, searchable word from the first available (priced) feed
 *  cards so search tests don't depend on seeded titles. */
async function searchableWord(page: Page): Promise<string> {
  const cards = discoverCards(page);
  await expect(cards.first()).toBeVisible(LOAD);
  const n = Math.min(await cards.count(), 8);
  for (let i = 0; i < n; i++) {
    const text = await cards.nth(i).innerText();
    if (!/\$[\d,]+\.\d{2}/.test(text) || /Sold/.test(text)) continue;
    // An imageless card's first line is the "No image" placeholder, not the
    // title — searching "image" once returned zero results. Skip those and
    // take the first non-placeholder line.
    const title = text.split('\n').find((l) => l.trim() && l.trim() !== 'No image') ?? '';
    if (/No image/.test(text)) continue;
    const words = (title.match(/[A-Za-z]{4,}/g) ?? []).sort((a, b) => b.length - a.length);
    if (words[0]) return words[0];
  }
  return 'art';
}

/** Cents parsed from the priced cards currently in the Discover grid, in DOM
 *  order (sold-price labels excluded — they aren't the sort key). */
async function cardPrices(page: Page): Promise<number[]> {
  const cards = discoverCards(page);
  await expect(cards.first()).toBeVisible(LOAD);
  const texts = await cards.allInnerTexts();
  const prices: number[] = [];
  for (const t of texts) {
    if (/Sold/.test(t)) continue;
    const m = t.match(/\$([\d,]+)\.(\d{2})/);
    if (m) prices.push(parseInt(m[1].replace(/,/g, ''), 10) * 100 + parseInt(m[2], 10));
  }
  return prices;
}

test.describe('front door (3.1, 3.2, 7.1)', () => {
  test('home page renders hero, feed cards, and no debris', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);

    await expect(page.locator('h1')).toContainText('Discover art from', LOAD);
    await expect(page.getByRole('link', { name: 'Join as an Artist' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Discover', exact: true })).toBeVisible(LOAD);

    // Populated staging: real cards, not the empty state.
    const cards = discoverCards(page);
    await expect(cards.first()).toBeVisible(LOAD);
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(cards.first().locator('img')).toBeVisible(LOAD);

    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('lorem ipsum');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('something went wrong');
  });

  test('the page never scrolls sideways (3.9)', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('cookie banner (3.8)', () => {
  test('appears, Accept dismisses it, and it stays dismissed across navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/We use cookies/)).toBeVisible(LOAD);
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(page.getByText(/We use cookies/)).toHaveCount(0);

    await page.goto('/about');
    await expect(page.getByRole('heading', { name: 'About Custom Canvas' })).toBeVisible(LOAD);
    await expect(page.getByText(/We use cookies/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'About Custom Canvas' })).toBeVisible(LOAD);
    await expect(page.getByText(/We use cookies/)).toHaveCount(0);
  });
});

test.describe('location picker (3.3)', () => {
  test('set a city, the page scopes to it, the choice persists, clearing returns to general', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    await expect(page.locator('h1')).toContainText('your local community', LOAD);

    // Type the city (the ZIP path hits zippopotam.us — the typed-city path
    // exercises the same picker without an external dependency).
    await openLocationModal(page);
    await page.getByPlaceholder('City (e.g. Houston) or ZIP (e.g. 77005)').fill('Houston, TX');
    await page.getByRole('button', { name: 'Go', exact: true }).click();

    await expect(page.locator('h1')).toContainText('Houston', LOAD);
    // The feed grows a Local/Everywhere scope toggle naming the community.
    await expect(page.getByRole('button', { name: /Local · Houston, TX/ })).toBeVisible(LOAD);
    await expect(page.getByRole('button', { name: 'Everywhere', exact: true })).toBeVisible();

    // It remembers (localStorage-backed).
    await page.reload();
    await expect(page.locator('h1')).toContainText('Houston', LOAD);

    // Clear — back to the general view.
    await openLocationModal(page);
    await page.getByRole('button', { name: /Clear — browse everywhere/ }).click();
    await expect(page.locator('h1')).toContainText('your local community', LOAD);
  });
});

test.describe('search (3.4, 7.5, 7.6)', () => {
  test('a nonsense query shows a calm empty state, not an error', async ({ page }) => {
    await page.goto('/?q=' + encodeURIComponent('zebra unicorn helicopter'));
    await dismissCookies(page);
    await expect(page.getByText('No art found')).toBeVisible(LOAD);
    await expect(page.getByText('Try adjusting your filters or check back later.')).toBeVisible();
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('something went wrong');
  });

  test('a real term returns results, and an extra junk word does not wipe them', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    const word = await searchableWord(page);

    await page.goto(`/?q=${encodeURIComponent(word)}`);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);

    // The forgiving any-term fallback: junk beside a real word still matches.
    await page.goto(`/?q=${encodeURIComponent(word + ' zzzyxq')}`);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);
  });

  test('navbar search suggestions appear and click through', async ({ page, isMobile }) => {
    test.skip(isMobile, 'navbar search is desktop-only; mobile uses the menu variant');
    await page.goto('/');
    await dismissCookies(page);
    const word = await searchableWord(page);

    const navInput = page.locator('nav').getByPlaceholder('Search art, artists, styles...');
    await navInput.pressSequentially(word, { delay: 60 });

    // Debounced 300ms; the dropdown lists Artists and/or Artwork sections.
    const dropdown = page.locator('nav .z-50');
    await expect(dropdown).toBeVisible(LOAD);
    const suggestion = dropdown.locator('button').first();
    await expect(suggestion).toBeVisible(LOAD);
    await suggestion.click();
    await expect(page).toHaveURL(/\/(listing|artist)\//, LOAD);
  });

  test('navbar search submits into the feed URL', async ({ page, isMobile }) => {
    test.skip(isMobile, 'navbar search is desktop-only; mobile uses the menu variant');
    await page.goto('/');
    await dismissCookies(page);
    const word = await searchableWord(page);

    const navInput = page.locator('nav').getByPlaceholder('Search art, artists, styles...');
    await navInput.fill(word);
    await navInput.press('Enter');
    await expect(page).toHaveURL(new RegExp(`[?&]q=${word}`, 'i'), LOAD);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);
  });
});

test.describe('filters, sort, and tabs (7.2, 7.3, 7.4)', () => {
  test('price sort actually reorders the feed', async ({ page }) => {
    await page.goto('/?sort=price_asc');
    await dismissCookies(page);
    const asc = await cardPrices(page);
    expect(asc.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < asc.length; i++) expect(asc[i]).toBeGreaterThanOrEqual(asc[i - 1]);

    await page.goto('/?sort=price_desc');
    const desc = await cardPrices(page);
    expect(desc.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < desc.length; i++) expect(desc[i]).toBeLessThanOrEqual(desc[i - 1]);
  });

  test('a price filter narrows results and the URL round-trips into a new tab', async ({ page, context }) => {
    // A floor of one cent keeps everything: results render.
    await page.goto('/?minPrice=1');
    await dismissCookies(page);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);

    // A one-cent ceiling excludes everything: the graceful empty state.
    await page.goto('/?maxPrice=1');
    await expect(page.getByText('No art found')).toBeVisible(LOAD);

    // Paste the filtered address into a "new tab": same filtered view.
    const tab = await context.newPage();
    await tab.goto('/?maxPrice=1');
    await expect(tab.getByText('No art found')).toBeVisible(LOAD);
    await tab.close();
  });

  test('the desktop filter bar writes its state into the URL', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mobile uses the filter drawer; the bar is hidden below md');
    await page.goto('/');
    await dismissCookies(page);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);

    const sortSelect = page.locator('select').filter({ hasText: 'Newest' });
    await sortSelect.selectOption('price_asc');
    await expect(page).toHaveURL(/sort=price_asc/, LOAD);

    const mediumSelect = page.locator('select').filter({ hasText: 'All Mediums' });
    await mediumSelect.selectOption('Oil Paint');
    await expect(page).toHaveURL(/medium=Oil\+Paint/, LOAD);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/medium=/, LOAD);
  });

  test('Art and Artists tabs both render populated views', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);

    await page.getByRole('button', { name: 'Artists', exact: true }).click();
    await expect(page).toHaveURL(/view=artists/, LOAD);
    const artistCards = page.locator('#feed a[href^="/artist/"]');
    await expect(artistCards.first()).toBeVisible(LOAD);
    expect(await artistCards.count()).toBeGreaterThanOrEqual(1);

    await page.getByRole('button', { name: 'Art', exact: true }).click();
    await expect(page).not.toHaveURL(/view=artists/, LOAD);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);
  });
});

test.describe('footer and static pages (3.5, 3.6, 3.10)', () => {
  test('footer links exist and every static page loads with a real heading', async ({ page }) => {
    // Five full navigations against a shared staging target, and the mobile
    // project is the slower of the two — this timed out at the default 30s
    // budget on three separate runs, always on a different page.
    test.setTimeout(90_000);
    await page.goto('/');
    await dismissCookies(page);
    const footer = page.locator('footer');
    for (const name of ['About', 'Partners', 'Terms', 'Terms of Sale', 'Shipping & Returns', 'Privacy', 'DMCA']) {
      await expect(footer.getByRole('link', { name, exact: true })).toBeVisible(LOAD);
    }

    const statics = [
      { path: '/about', heading: 'About Custom Canvas' },
      { path: '/partners', heading: 'Partners' },
      { path: '/terms', heading: 'Terms of Service' },
      { path: '/privacy', heading: 'Privacy Policy' },
    ];
    for (const { path, heading } of statics) {
      const res = await page.goto(path);
      expect(res?.ok(), `${path} should respond 200`).toBeTruthy();
      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible(LOAD);
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body, `${path} has placeholder copy`).not.toContain('lorem ipsum');
      expect(body, `${path} has placeholder copy`).not.toContain('under construction');
    }
  });

  /** L1: the eight counsel documents are published from the repo markdown.
   *  Each page must render its own heading, the version line parsed out of
   *  the document, and enough body text that a blank or half-rendered page
   *  fails here. The version numbers are the ones acceptance is stamped
   *  against (L2) — if counsel ships a new version, this fails until the
   *  constants and this list move together. */
  const LEGAL_PAGES = [
    { path: '/terms', heading: 'Terms of Service', version: '2.0' },
    { path: '/terms-of-sale', heading: 'Terms of Sale', version: '2.0' },
    { path: '/shipping-returns', heading: 'Shipping, Returns & Refunds', version: '1.0' },
    { path: '/privacy', heading: 'Privacy Policy', version: '2.0' },
    { path: '/dmca', heading: 'DMCA & Copyright Policy', version: '1.0' },
    { path: '/seller-protection', heading: 'Seller Protection Policy', version: '1.0' },
    { path: '/listing-standards', heading: 'Listing Standards', version: '1.0' },
    { path: '/artist-agreement', heading: 'Artist Agreement', version: '2.0' },
  ];

  for (const { path, heading, version } of LEGAL_PAGES) {
    test(`${path} publishes ${heading} v${version} from source`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.ok(), `${path} should respond 200`).toBeTruthy();
      await dismissCookies(page);

      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible(LOAD);
      await expect(page.getByText(`Version ${version} · Effective September 3, 2026`)).toBeVisible(LOAD);

      const body = await page.locator('body').innerText();
      // A page that failed to read its markdown still renders the header.
      expect(body.length, `${path} rendered no document body`).toBeGreaterThan(2000);
      expect(body, `${path} still shows a counsel placeholder`).not.toMatch(
        /\[(NAME OR POSITION|TELEPHONE NUMBER|DEDICATED DMCA EMAIL)\]/,
      );
      // Every document links to the rest of the set (ToS 16.1, ToSale 9).
      await expect(page.getByRole('navigation', { name: 'Other policies' })).toBeVisible(LOAD);
    });
  }

  test('/galleries redirects to the Partners page', async ({ page }) => {
    await page.goto('/galleries');
    await expect(page).toHaveURL(/\/partners/, LOAD);
    await expect(page.getByRole('heading', { name: 'Partners', level: 1, exact: true })).toBeVisible(LOAD);
  });

  test('about page states the ~3% buyer service fee and never the artist split', async ({ page }) => {
    await page.goto('/about');
    await dismissCookies(page);
    await expect(page.getByRole('heading', { name: 'Fair, Simple Pricing' })).toBeVisible(LOAD);
    const body = await page.locator('body').innerText();
    expect(body).toContain('service fee');
    expect(body).toContain('about 3% of the price');
    // The one we specifically care about: no 15% / 85-15 split signed out.
    expect(body).not.toContain('15%');
    expect(body).not.toContain('85/15');
  });
});

test.describe('guarded actions while signed out (3.7)', () => {
  test('/orders and /saved bounce to login carrying a returnUrl', async ({ page }) => {
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders/, LOAD);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible(LOAD);

    await page.goto('/saved');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fsaved/, LOAD);
  });

  test('a commission request bounces to login carrying a returnUrl', async ({ page }) => {
    await page.goto('/commission-request?artist=anyone');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcommission-request/, LOAD);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible(LOAD);
  });

  test('save hearts are simply not offered to signed-out visitors', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    await expect(discoverCards(page).first()).toBeVisible(LOAD);
    // FeedCard renders the heart only for signed-in users — its absence IS the
    // guard here (nothing to click, so nothing can error).
    await expect(page.locator('#feed button[aria-label="Save"]')).toHaveCount(0);
    await expect(page.locator('#feed button[aria-label="Unsave"]')).toHaveCount(0);
  });
});

test.describe('listing page (7.7, 7.8, 7.10)', () => {
  test('a listing opens from the feed with image, price, details, and a safe buy path', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    // Pick a card WITH a real photo — an imageless card has no carousel.
    const first = discoverCards(page).filter({ has: page.locator('img') }).first();
    await expect(first).toBeVisible(LOAD);
    await first.click();
    await expect(page).toHaveURL(/\/listing\//, LOAD);

    // Identity: title, artist link, carousel image, details.
    await expect(page.locator('h1')).not.toBeEmpty();
    await expect(page.locator('a[href^="/artist/"]').first()).toBeVisible(LOAD);
    await expect(page.locator('img[alt*="image 1 of"]')).toBeVisible(LOAD);
    await expect(page.getByText(/^Medium: /)).toBeVisible();

    // Price label in the purchase rail: a real price, Contact for price, or Sold.
    await expect(page.locator('span.text-2xl.font-bold')).toHaveText(
      /\$[\d,]+\.\d{2}|Contact for price|Sold/,
      LOAD
    );

    // Fee copy: when the panel quotes money it must show the Service fee and
    // an estimated total — and never the artist split.
    if (await page.getByText('Service fee').isVisible().catch(() => false)) {
      await expect(page.getByText('Estimated total')).toBeVisible();
    }
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('15%');
    expect(body).not.toContain('85/15');

    // Related work, when this artist has any.
    const related = page.getByRole('heading', { name: 'More From This Artist' });
    if (await related.isVisible().catch(() => false)) {
      const section = page.locator('div').filter({ has: related }).last();
      expect(await section.locator('a[href^="/listing/"]').count()).toBeGreaterThan(0);
    }

    // The way to buy, signed out, leads to login — never a crash.
    const buyNow = page.getByRole('button', { name: 'Buy Now' });
    const messageArtist = page.getByRole('button', { name: 'Message Artist' });
    if (await buyNow.isVisible().catch(() => false)) {
      await buyNow.click();
      await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcheckout%2F/, LOAD);
    } else if (await messageArtist.isVisible().catch(() => false)) {
      // Payments off (or price on request): messaging is the buy path.
      await messageArtist.click();
      await expect(page).toHaveURL(/\/login/, LOAD);
    } else {
      // Sold/unavailable piece: the panel says so calmly.
      await expect(page.getByText(/no longer available/i)).toBeVisible(LOAD);
    }
  });

  test('the artist public page opens from a listing (7.11)', async ({ page }) => {
    await page.goto('/');
    await dismissCookies(page);
    const first = discoverCards(page).first();
    await expect(first).toBeVisible(LOAD);
    await first.click();
    await expect(page).toHaveURL(/\/listing\//, LOAD);

    const artistLink = page.locator('a[href^="/artist/"]').first();
    const name = (await artistLink.innerText()).trim();
    await artistLink.click();
    await expect(page).toHaveURL(/\/artist\//, LOAD);
    await expect(page.locator('h1')).toHaveText(name, LOAD);

    // Follow is signed-in-only: absent, not broken.
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveCount(0);

    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body).not.toContain('something went wrong');
    expect(body).not.toContain('undefined');
  });
});

test.describe('nonsense addresses (7.12)', () => {
  test('/artist/does-not-exist renders the not-found page with a way back', async ({ page }) => {
    await page.goto('/artist/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible(LOAD);
    await expect(page.getByRole('link', { name: 'Explore Art' })).toBeVisible();
  });

  test('/listing/not-a-real-id renders the not-found page, not a crash', async ({ page }) => {
    await page.goto('/listing/not-a-real-id');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible(LOAD);
    await expect(page.getByRole('link', { name: 'Explore Art' })).toBeVisible();
  });
});
