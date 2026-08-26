# E2E suite

Playwright specs automating the whole 149-step `docs/LIVE-TEST-PLAN.md`
(written during the 2026-08 sweep, commits `e7e7e68..fefc727`), plus two
older fixture-consuming regression suites (`approval-flow`, `setup-guard`).

## Running

```sh
./scripts/run-e2e.sh              # the whole suite against staging
E2E_MONEY=1 ./scripts/run-e2e.sh  # include the Stripe-test money loop
```

The runner generates the fixture images, seeds DEV (`scripts/seed-e2e.mjs` —
resets seed-account passwords, creates a fresh admin, draft artist and guard
fixtures, deletes the previous run's consumed fixtures), then runs each spec
file **sequentially with `--workers=1`**. Never parallelize across spec
files: parallel logins trip Supabase auth rate limits.

One spec by hand (env contract is in each spec's header comment; get the
exports with `node scripts/seed-e2e.mjs`):

```sh
./node_modules/.bin/playwright test <spec> --project=chromium --workers=1
```

## Consumables — why seeding runs per-sweep

- `approval-flow` ends with its draft artist approved and live — a fresh
  DRAFT artist is needed every run.
- `setup-guard`'s wizard-walk test creates the missing profile row for the
  no-profile fixture — fresh guard accounts are needed every run.
- `purchase-refund` (money) hides its own listing afterwards.
- Everything `e2e.*@customcanvas.dev` on DEV is disposable test-bed state;
  the seeder deletes prior `e2e.admin.*` / `e2e.draft.*` / `e2e.guard.*`
  accounts at the start of each run.

Long-lived seed accounts (password re-rolled every seeding):
`artist.test@customcanvas.dev` (live artist), `buyer.test@customcanvas.dev`
(buyer with history), `bayou-city-gallery@cc-demo.com` (verified partner).

## Environmental caveats (deliberate, not bugs)

- **DEV/staging has `mailer_autoconfirm=true`** — Supabase's built-in mailer
  caps at 2 emails/hour and would 429 signups. Specs register accounts
  through the real form and are signed straight in.
- **Turnstile is off on staging** (no `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in
  the staging build). Against a captcha-enabled build, login helpers
  correctly fail — run against staging, or build without the site key.
  `NEXT_PUBLIC_*` is baked at BUILD time: a local prod build must receive
  the right Supabase env at `next build` or the app silently talks to the
  wrong project and every sign-in times out.
- **Auth throttling under repeated runs**: many back-to-back logins throttle
  token issuance and produce hydration-stall / signed-out-on-reload flakes
  no human sees. The specs carry reload-recovery guards for this, and the
  runner sleeps between spec files. A lone flake in a heavy session
  (historically 8.17 in `lover-social`) usually passes on a solo re-run.
- The money loop needs Stripe TEST keys in the target environment and
  `E2E_MONEY=1`.

## Nightly

Preferred: GitHub Actions — blocked until minutes/billing are restored
(LAUNCH.md TODO; add the `E2E_*` secrets when wiring it).
Fallback (active): a local launchd job runs `scripts/nightly-e2e.sh` at
03:30 and logs to `~/Library/Logs/custom-canvas-e2e/` — see that script's
header for install/uninstall.
