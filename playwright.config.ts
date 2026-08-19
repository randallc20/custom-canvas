import { defineConfig, devices } from '@playwright/test';

// Run against staging (or a local `npm run start`). Set E2E_BASE_URL.
// Browsers: `npx playwright install` first. Authenticated critical-path specs
// need seeded test accounts (see e2e/README).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  // Without an html reporter there is no playwright-report/ dir and CI's
  // failure-artifact upload is empty; traces land in test-results/.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://custom-canvas-chi.vercel.app',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
