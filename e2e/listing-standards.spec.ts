import { test, expect } from '@playwright/test';
import { artistCreds, login } from './helpers/auth';

const creds = artistCreds();

/**
 * L4 — Listing Standards Part one and Part three, in the real form.
 *
 * The rule with teeth is the reproduction one: "Describing a reproduction as
 * an original is grounds for immediate removal and account closure." An
 * artist should meet that as a field error at publish time, not as an email
 * later. And a mature-tagged piece has to actually leave the browsing feed,
 * or "tagged so it can be filtered" is a sentence rather than a feature.
 */
test.describe('listing standards (L4)', () => {
  test.skip(!creds, 'E2E_ARTIST_EMAIL/PASSWORD not set');

  test('a reproduction must say so in its title, and the standard is quoted', async ({ page }) => {
    await login(page, creds!.email, creds!.password);
    await page.goto('/listings/new');

    const title = `L4 Standards Check ${Date.now().toString(36)}`;
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Medium').fill('Archival inkjet on paper');
    await page.getByLabel('Price ($)').fill('60');
    await page.getByLabel('Condition').fill('New, no damage.');
    await page.getByLabel('What is it?').selectOption('reproduction');

    // The form warns before submit, and refuses on submit.
    await expect(page.getByText(/clearly identify this as a print or reproduction/i)).toBeVisible();
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(
      page.getByText(/title or first displayed line must clearly identify it as a print or reproduction/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/listings\/new/);

    // Say it, and it publishes.
    await page.getByLabel('Title').fill(`${title} (print)`);
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });
  });

  test('a limited edition must state its size and number', async ({ page }) => {
    await login(page, creds!.email, creds!.password);
    await page.goto('/listings/new');
    await page.getByLabel('Title').fill(`L4 Edition ${Date.now().toString(36)}`);
    await page.getByLabel('Medium').fill('Screenprint');
    await page.getByLabel('Price ($)').fill('120');
    await page.getByLabel('Condition').fill('New, no damage.');
    await page.getByLabel('What is it?').selectOption('limited_edition');

    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page.getByText(/must state its total size/i)).toBeVisible({ timeout: 15_000 });

    // A number outside the edition is refused too.
    await page.getByLabel('Edition size').fill('50');
    await page.getByLabel("This piece's number").fill('60');
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page.getByText(/cannot be number 60 of 50/i)).toBeVisible({ timeout: 15_000 });
  });

  test('a mature piece leaves the browsing feed until the viewer opts in', async ({ page, browser }) => {
    await login(page, creds!.email, creds!.password);
    await page.goto('/listings/new');
    const title = `L4 Mature ${Date.now().toString(36)}`;
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Medium').fill('Charcoal on paper');
    await page.getByLabel('Price ($)').fill('90');
    await page.getByLabel('Condition').fill('New, no damage.');
    await page.getByLabel(/contains nudity or mature themes/i).check();
    await page.getByRole('button', { name: /publish listing/i }).click();
    await expect(page).toHaveURL(/\/studio\/work/, { timeout: 30_000 });

    // A fresh anonymous context: not in the feed, and searching for it by
    // name does not surface it either.
    const anon = await browser.newContext();
    const visitor = await anon.newPage();
    await visitor.goto(`/?search=${encodeURIComponent(title)}`);
    await expect(visitor.getByText(title)).toHaveCount(0);

    // Opting in from the filters brings it back.
    await visitor.getByLabel(/show mature work/i).first().check();
    await expect(visitor.getByText(title).first()).toBeVisible({ timeout: 15_000 });
    await anon.close();
  });
});
