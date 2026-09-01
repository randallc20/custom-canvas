# Hardening & Polish Plan — post-sweep arc

*Written 2026-08-26, immediately after the full-app e2e sweep (see git log
`e7e7e68..fefc727`). That sweep automated the entire 149-step
`docs/LIVE-TEST-PLAN.md` as eight Playwright spec files (all green) and found
eleven real defects, all fixed and deployed. This plan is the follow-up work:
institutionalize the lessons, finish what the walks surfaced, and clear the
launch leftovers. It is written to be executed cold, in a fresh conversation,
phase by phase — each phase is independently shippable and reviewable.*

**Ground rules for the implementing session**
- Branch per phase (`hardening/p1-silent-writes` etc.), PR-style commits to
  master after the phase's verification passes. Staging auto-deploys from
  master; prod deploys are manual: `npx -y vercel@59.5.0 deploy --prod --token
  "$VERCEL_TOKEN" --yes` (token in `.env.local`; prod is NOT git-linked; the
  unpinned `npx vercel` has pulled broken releases).
- Never run `pnpm` in this repo (npm lockfile; a stray `pnpm-lock.yaml` flips
  Vercel's package manager and skips sharp's build script). Use
  `./node_modules/.bin/*` directly.
- Verification bar per phase: `tsc --noEmit`, `next lint`, `vitest run`, plus
  the phase's own acceptance checks below, plus the relevant e2e spec(s) —
  see "Running the suite" at the bottom.

---

## P1 — Eradicate the silent-write class

**Why.** Ten of the sweep's eleven defects were one disease: a client-side
Supabase write that RLS, a column guard, or a missing policy silently turned
into a zero-row no-op — error swallowed or absent, success toast on top.
Fixed instances to copy the pattern from: `src/services/artists.ts`
(updateArtistProfile), `src/components/account/EmailPreferences.tsx`,
`src/app/admin/disputes/page.tsx` (handleResolve), `src/app/api/galleries/route.ts`
(service-role PATCH), `src/app/api/account/delete/route.ts`.

**Do.**
1. Inventory every remaining client-side `.update(`, `.delete(`, `.upsert(`
   and `.insert(` in `src/` (grep, then read each). Known untested candidates:
   mute/forward toggles in the chat components, `AwayModeToggle`,
   `PinnedListingSelector`, `SeriesSection` (create/update/delete/cover),
   `PersonalPhotoUploader` (delete/reorder/caption), `ListingImagesManager`
   (reorder/delete), gallery roster + picks writes in `GalleryDashboard`,
   `handleAvatarUploaded`/`handleBannerUploaded` in `ArtistProfileEdit`,
   follows/saves, notification mark-read.
2. For each write: (a) assert affected rows — `.select('id').maybeSingle()`
   (or `.select('id')` + length check for multi-row) and treat zero rows as
   failure; (b) surface the failure (toast with a real message; never bare
   `catch {}`); (c) if the write happens near signup/login, wrap with
   `withSessionRetry` from `src/lib/sessionRetry.ts`.
3. Writes that are genuinely privileged (admin actions) move behind an API
   route using `createAdminSupabaseClient()` after a role check — the
   pattern in `src/app/api/galleries/route.ts` PATCH.
4. Add a short "writes must assert rows" note to the top of
   `src/lib/sessionRetry.ts` or a new `docs/CONVENTIONS.md` so the rule
   outlives this arc.

**Accept.** Grep shows no client `.update(`/`.delete(` without a returning
clause or an explicit comment justifying it; every catch around a write
surfaces a toast; `e2e` suite still green.

---

## P2 — Database-layer test suite (RPCs + policy matrix)

**Why.** `link_education_partners` was *invalid SQL* from migration 00008
until 00043 — every education save errored — and `reports` shipped with no
UPDATE policy, `gallery_profiles` with no DELETE and owner-only UPDATE. No
browser test should be the first thing to catch "function does not parse"
or "verb has no policy."

**Do.** Create `scripts/db-smoke.sql` + a tiny runner `scripts/db-smoke.sh`
(plain psql against DEV; connection: host
`aws-1-us-east-2.pooler.supabase.com`, user `postgres.nlatruygmarojthfjzog`,
password env `SUPABASE_DB_PASSWORD` from `.env.local`).
1. **RPC smoke**: one `SELECT <fn>(...)` per public function with throwaway
   args inside a rolled-back transaction — catches invalid SQL instantly.
   Enumerate functions from `information_schema.routines` and hand-maintain
   the call list in the script (fail the script if a public function exists
   with no call listed).
2. **Policy matrix**: for each RLS-enabled table, assert the EXPECTED set of
   `(polcmd, polname)` from `pg_policy` against a checked-in expectation —
   so "someone dropped/never wrote the UPDATE policy" is a diff, not a
   production mystery. Seed the expectation from today's actual state.
3. **Grant matrix**: for the column-restricted tables (`profiles`,
   `artist_profiles`) assert the granted column lists match
   `src/lib/publicProfile.ts` — the roster-search bug was a drift between
   these two.
4. Wire into `vitest` as a shell-out test OR document as a pre-merge step in
   CONVENTIONS.md if CI minutes stay unavailable.

**Accept.** Running `scripts/db-smoke.sh` passes on DEV and prod; deleting a
policy or breaking an RPC in a scratch schema makes it fail.

---

## P3 — Nightly e2e + committed seed script

**Why.** The suite only has value if it keeps running, and today its fixture
knowledge lives in session memory, not the repo.

**Do.**
1. `scripts/seed-e2e.mjs` (node, service-role key from `.env.local`), doing
   what the sweep did by hand: reset passwords for
   `artist.test@customcanvas.dev` / `buyer.test@customcanvas.dev` /
   `bayou-city-gallery@cc-demo.com` to a fresh printed password; create
   `e2e.admin.<ts>@` (promote to admin via SQL), a fresh DRAFT artist with
   avatar + 120-char story + agreement `1.0` + one listing (approval-flow
   CONSUMES one per run), and `e2e.guard.noprofile.<ts>@` (artist, no
   artist_profiles row) + `e2e.guard.nogallery.<ts>@` (gallery, no gallery
   row) — the guard wizard tests consume those rows, so the script must
   also DELETE stale rows for prior guard fixtures. Print the full env
   export block ready to paste.
2. `scripts/run-e2e.sh`: generates the two images (tiny png + ~16MB
   zlib-level-0 noise png — see `e2e/` docs comment; python3 stdlib), calls
   seed, then runs each spec file **sequentially** with `--workers=1`
   (parallel logins trip Supabase auth rate limits). `E2E_MONEY=1` optional
   flag for the Stripe-test money loop.
3. Nightly: preferred = GitHub Actions once minutes/billing are restored
   (add the `E2E_*` secrets — open LAUNCH.md TODO); fallback = local
   launchd/cron invoking `run-e2e.sh` and mailing/logging the summary.
4. Document the known environmental caveats in `e2e/README.md`: DEV/staging
   has `mailer_autoconfirm=true` (deliberate — Supabase's built-in mailer
   caps at 2/hr and would 429 signups); Turnstile is off on staging;
   repeated back-to-back full runs throttle auth token issuance and produce
   hydration-stall flakes no human sees (the reload-recovery guards in the
   specs exist for this).

**Accept.** From a clean checkout + `.env.local`, `scripts/run-e2e.sh`
goes green end-to-end with no manual steps.

---

## P4 — Sentry on every surfaced failure

**Why.** Failures are now visible to users (toasts); they should be visible
to us without a tester. `src/lib/sentry.ts` already exports
`captureException`.

**Do.** Add `captureException` to: the shared `toastError` helper in the
hooks (`src/hooks/useListings.ts` et al.), `useSendMessage.onError`,
`MessageInput.handleFile` catch, `EmailPreferences.save` failure branch,
`CommissionPanel.performAction` catch, admin pages' failure toasts
(applications/galleries/disputes/orders), and the `console.error` in
`src/services/artistContent.ts` (education linker). Tag each with a
`where:` context string.

**Accept.** Grep: no user-facing failure toast fires without a matching
capture; a deliberately-broken call in dev shows up in the Sentry stream.

---

## Execution notes — P1–P4 run 2026-08-26 (where reality diverged)

- **P1 DONE.** The sweep found four MORE live defects beyond the known
  candidates: (1) admin "Hide listing" had never worked — `listings` has no
  admin UPDATE policy, so the client update matched zero rows behind a
  success toast; moved behind `PATCH /api/admin/listings/[id]` + a new
  admin-safety 13.5 spec. (2) `GalleryDashboard.handleRemoveArtist` wrapped
  supabase-js in try/catch — it returns errors, doesn't throw, so failures
  toasted success. (3) `PurchasePanel`'s Message Artist passed only
  onSuccess — failures did nothing. (4) **`AuthContext.fetchProfile` did
  `setUser(null)` on ANY error**, so a transient profile-fetch failure
  (network blip, expired-token race) made AuthGuard bounce a validly
  signed-in user to /login — and every onAuthStateChange event re-fetched,
  multiplying the chances. Server sessions were proven fine via curl; the
  sign-out was purely client-side. Fixed: one refresh-retry, only PGRST116
  treated as signed-out. Dead client write paths (`createOrder`,
  `createNotification`, `updateReportStatus`, `updateLastMessage`) were
  deleted rather than hardened.
- **P2 DONE.** As specced, plus an RLS-enabled assertion and a
  private-columns-stay-ungranted check. Prod's pooler is on the **aws-0**
  cluster (DEV is aws-1). Grant expectations include three granted-but-
  unlisted artist columns (`agreement_*`, `search_vector`) as documented
  facts. CI wiring: documented as a pre-merge step in CONVENTIONS.md (no
  CI minutes), not a vitest shell-out.
- **P3 DONE.** `seed-e2e.mjs` deletes ALL stale `e2e.*` users each run (not
  just guard fixtures) — everything `e2e.*@` is disposable. Nightly =
  launchd fallback active at 03:30 (`scripts/nightly-e2e.sh` + plist);
  GitHub Actions remains the preferred path once billing is restored.
- **P4 DONE.** Expanded beyond the named list to EVERY operation-failure
  toast in `src/` (~35 sites). Deliberately uncaptured: user-input
  validation and environment noise (clipboard/geolocation). Expected
  concurrency (409 on submit/decide) excluded from capture. Verified at the
  network level (Sentry envelope observed leaving the browser) — no Sentry
  API token available for stream-side assertion.
- The lover-social 8.17 flake under back-to-back runs was the AuthContext
  bug above; the spec also gained re-login recovery guards for genuinely
  revoked sessions.

## Execution notes — P5–P6 run 2026-08-27→09-01

- **P5 DONE.** 00047 trigger on follows (24h per-follower dedupe, links to
  the follower's public surface when they have one); commission-request
  notification inserted server-side in POST /api/commissions (service role
  — notifications has no client INSERT policy); NotificationType union
  extended from 13 to all 21 DB types and both icon maps completed. 8.4
  flipped from skip to hard assertion; 11.2 asserts the in-app request.
- **P6 DONE**, including the optional banner upload (the tester doc always
  asked for it). Beyond the plan: closed_by ('artist'|'requester') was
  needed alongside closed_reason to label the states; CommissionStatus was
  unified onto commissionDisplayStatus (it showed raw 'cancelled' in red
  beside 'Declined by artist'); the away-date fix also covered
  PurchasePanel. Inbox pills keep the plain 'Closed' (no closed_by in the
  list payload — deliberate).
- Both migrations applied to DEV and prod by hand (no supabase_migrations
  table in this project — psql is the procedure), db-smoke green on both.
- **The nightly silently failed its first five nights**: nvm.sh cannot be
  sourced under `set -u` and the failure was swallowed — every run died in
  seconds with `node: command not found`. Fixed by resolving the newest
  ~/.nvm node bin directly. A full launchd-environment run then went
  10/10 spec files green — which also proved the visitor/commissions
  failures seen on 08-27 were per-IP rate-limit residue from back-to-back
  suite runs, not defects (same code, cooled limits, green).
- Review extras fixed inline: seeder now sweeps orphaned throwaway
  listings out of the public staging feed; commissions prep got the
  standard reload-recovery.

---

## P5 — Finish the notification pipeline

**Why.** `new_follower` exists in the DB enum and both icon maps but nothing
ever creates one; a new commission request sends email but no in-app
notification (`commission_request` is likewise mapped-but-never-created);
`commission_update` is missing from the notifications page's `TYPE_ICONS`
(falls back to 🔔).

**Do.**
1. New-follower: insert a `notifications` row when a follow is created —
   either a DB trigger on `follows` (mirroring 00017's new_listing/price_drop
   triggers, dedupe on rapid follow/unfollow) or in `POST /api/follows`.
   Copy: "«name» started following you", link `/artist/<their-view>` or the
   follower's profile-appropriate surface.
2. Commission request: in `POST /api/commissions`, insert an artist-facing
   notification linking to `/messages/<conversation_id>`.
3. Add `commission_update` (and any other unmapped types) to `TYPE_ICONS`.
4. Un-skip / extend the e2e assertions that documented these gaps:
   lover-social 8.4 (`e2e/lover-social.spec.ts` — the skip explains itself)
   and the commissions spec's 11.2 note.

**Accept.** Follow → artist sees the notification; commission request →
artist sees it; both e2e assertions flipped from skip to green.

---

## P6 — UX polish batch (each < 1 hour)

1. **Commission decline reason + closed-state labels.** Declined, buyer-
   cancelled and quote-declined all collapse to status `cancelled`,
   displayed as "Closed". Add an optional reason textarea to the artist's
   Decline flow (store on the commission; show in the panel), and label the
   states distinctly ("Declined by artist" / "Cancelled by you" /
   "Closed"). Touches the commission components + `CommissionStatus`
   mapping; check the decline route for where a reason column fits
   (migration needed: `commissions.closed_reason TEXT`).
2. **Conversation reports mislabel.** `src/app/admin/disputes/page.tsx`
   renders "Listing: Deleted" for conversation-level reports (null
   listing_id). Show "Conversation report" with a link to the conversation
   context instead.
3. **Away-mode date off-by-one.** `new Date('YYYY-MM-DD')` parses UTC and
   can render a day early in Chicago — in `AwayModeToggle` and the public
   `ProfileHero` badge. Parse as local (`new Date(y, m-1, d)`) or format
   with `timeZone: 'UTC'`.
4. **Footer Partners link.** The footer has About/Terms/Privacy; `/partners`
   is live and the test plan's footer walk names it. Add it.
5. **Gallery website_url render.** Saved in the profile editor but never
   displayed — add to `GalleryHero` on `/gallery/[slug]`.
6. **Hamburger aria-label.** `nav button.md:hidden` has no accessible name;
   add `aria-label="Menu"`. (The avatar-menu initial button too.)
7. **Gallery banner upload (optional).** Plan step 12.6 expects one;
   `GalleryProfileEdit` has no upload field. If added, follow the
   avatar/banner ImageUpload pattern + a `banners` bucket path.
8. Update the corresponding `docs/LIVE-TEST-PLAN.md` steps if behavior
   changes (10.7 was already corrected this way — keep plan and app in
   lockstep, and note the published artifact copy of the plan may need a
   refresh from its owning conversation).

**Accept.** Visitor + commissions + partner e2e specs updated where copy
changed, all green.

---

## P7 — Launch leftovers (LAUNCH.md)

Only after the tester round finishes. **Decisions locked 2026-09-01:**
1. **Stripe: stay in TEST mode until the tester is out**, then flip live +
   MCC 5712 → 5971 as the literal last step (editing industry on a fresh
   account can trigger re-review), together with the pre-launch data wipe.
2. **Key rotation: deferred by Chris** (conversation deletion as
   mitigation; everything exposed is DEV/test-tier — `sk_live_` was
   already rotated 2026-08-26).
3. **Monitoring: no BetterStack** — use Sentry's built-in Uptime monitor
   (free tier includes one; add customcanvas.shop in the Sentry
   dashboard), plus Vercel Analytics/Speed Insights toggles and Sentry
   alert rules.
4. **GitHub Actions nightly: DROPPED** — the account's shared minutes
   (Flightsheet CI burns ~30 min/run) would blow the free tier again; the
   launchd nightly is proven and stays. Chris removes the card and sets
   the Actions spending limit to $0.

---

## P8 — Founding-artist recruitment (separate repo, biggest lever)

The marketplace's real risk is the empty room: prod is wiped and launch
needs art. `~/Projects/houston-artist-directory` already holds 317 artist
sightings (~84% with emails) from sessions 0–3; Session 4 (the resolver —
dedupe/merge sightings into contactable artist records) is the next planned
step there. Recommendation: run that as its own arc, then draft the
founding-artist outreach email (positioning: zero listing fees, Houston-
local, founding cohort) for Chris's approval before anything sends.

---

## Running the suite (operational reference)

```
# one spec at a time, always --workers=1 (auth rate limits)
./node_modules/.bin/playwright test <spec> --project=chromium --workers=1
```
Specs: `tester-journey`, `visitor`, `artist-shop`, `lover-social`,
`commissions`, `partner`, `admin-safety`, `purchase-refund` (needs
`E2E_MONEY=1`). Env contract per spec is in each file's header comment.
Consumables per full run: fresh draft artist (approval-flow), guard-fixture
row deletion, and the money spec hides its own listing afterward. The
`e2e.*@customcanvas.dev` accounts on DEV are disposable test-bed state.

Defect history and spec-craft lessons from the sweep live in the memory file
`custom-canvas-live-test-round` and in commit messages `e7e7e68..fefc727`.
