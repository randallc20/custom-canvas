import { test, expect } from '@playwright/test';

// Public-surface smoke tests — runnable with no auth/seed data.
test('home renders with the warm design system', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Custom Canvas' }).first()).toBeVisible();
  // Hero copy is location-aware since Build 4: "…{city}'s local artists" or
  // "…your local community" before a city is chosen.
  await expect(page.getByRole('heading', { name: /local (artists|community)/i })).toBeVisible();
});

test('register page gates on terms acceptance', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByText(/Terms of Service/i)).toBeVisible();
  // Create Account is disabled until the terms checkbox is ticked.
  await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled();
});

test('navbar search routes to a query', async ({ page }) => {
  await page.goto('/');
  const search = page.getByPlaceholder(/search art/i).first();
  await search.fill('watercolor');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=watercolor/);
});

test('partners directory loads', async ({ page }) => {
  await page.goto('/partners');
  await expect(page).toHaveURL(/partners/);
});
