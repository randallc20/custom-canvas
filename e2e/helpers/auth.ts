import { Page, expect } from '@playwright/test';

/**
 * Log in through the real UI form and wait until the app-level session settles.
 * Turnstile is disabled on staging (no NEXT_PUBLIC_TURNSTILE_SITE_KEY), so the
 * Sign In button is not gated there. Against a captcha-enabled environment this
 * helper will (correctly) fail — run the suite against staging.
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // The login page redirects away on success (role home or returnUrl). Landing
  // anywhere other than /login means the cookie-backed session took hold — the
  // exact regression that silently broke every authed route in Build 3.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

type Creds = { email: string; password: string };

/** Buyer/artist creds from env; return null so specs can skip when unset (CI without secrets). */
export function buyerCreds(): Creds | null {
  const email = process.env.E2E_BUYER_EMAIL;
  const password = process.env.E2E_BUYER_PASSWORD;
  return email && password ? { email, password } : null;
}

export function artistCreds(): Creds | null {
  const email = process.env.E2E_ARTIST_EMAIL;
  const password = process.env.E2E_ARTIST_PASSWORD;
  return email && password ? { email, password } : null;
}
