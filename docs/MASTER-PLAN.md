# Custom Canvas — Master Plan to Fully Live
*Written 2026-08-18. Supersedes `docs/REVIEW-FIX-PLAN.md` (five-lens review
findings) and folds in the artist-onboarding decisions. This is the single
source of truth: every remaining work item, who does it, in what order, ending
with the exact go-live sequence. Check items off as they land.*

---

## Where we are today (verified, not assumed)

**LIVE:** customcanvas.shop serves the full app from the `custom-canvas-prod`
Vercel project against the production Supabase (`nxdbmaslsfaestusrapp`), with
Resend on the real domain, Turnstile CAPTCHA, Sentry, and 4 crons.
**NOT live:** money — Stripe keys are test-mode and checkout is gated off
(`NEXT_PUBLIC_PAYMENTS_ENABLED=false`, enforced server-side, verified).
**Built, unmerged:** `feat/l2-hardening` (rate limiting, e2e, runbook) and
`feat/artist-approval` (review gate) — both reviewed by a 5-lens adversarial
pass; findings below. **Bank account exists** as of 2026-08-18 → Stripe live
activation is unblocked.

**Decisions locked (Chris):**
- Pending artists build fully (profile + listings + Stripe KYC) but stay
  hidden; approval = one click, whole shop goes live at once.
- Reject carries a reason; artist fixes and resubmits.
- Artists enter the review queue **when they submit** (draft → submit →
  pending), not at signup.
- Photographer services = curated directory v0, no booking/payments.
- Commissions move no money at launch (off-platform payment; revisit).

---

# TRACK A — Code (me). Five fix PRs + two feature PRs.

**STATUS 2026-08-18: ALL SEVEN PRs SHIPPED** — PR-1 (#1), PR-2 (#2),
PR-5+6 (#3), PR-3 (#4), PR-4 (#5), PR-7 (#6); migrations 00030–00038 applied
to DEV and PROD. Track A is COMPLETE. What remains is Track B (Chris) and
the Final Sequence below.

**MERGE ORDER (final, 2026-08-18): PR-1 → PR-2 → PR-5 → PR-6 → PR-3 → PR-4
→ PR-7.** Onboarding features (5/6) jump ahead of the refund work (3) so
artist seeding can start ~2 days sooner — payments stay off during seeding,
so nothing artist-facing waits on the money fixes. PR-3 must merge before
the Stage-3 payments flip; PR-4/PR-7 anytime before public launch.

## PR-1 `fix/security-rls` — pre-existing security holes (site is live → first)
*~half day. Off master. Deploy immediately on merge.*

### 1.1 Stop anonymous email harvesting
`profiles` SELECT policy is `USING (true)` and RLS is row-level → the public
anon key returns `email` for every user (verified via policy inspection).
Postgres privileges are additive, so the fix is **revoke table-level SELECT,
grant back public columns**:
- [ ] Migration `00031_profiles_column_privacy.sql`:
      `REVOKE SELECT ON profiles FROM anon, authenticated;`
      `GRANT SELECT (id, full_name, avatar_url, role, created_at, updated_at, email_preferences) ON profiles TO anon, authenticated;`
      (email + unsubscribe_token stay service-role-only. `email_preferences`
      stays granted: the account page edits it and prefs are non-sensitive
      booleans.)
- [ ] Fix every client-context reader (each verified by grep):
      - `src/context/AuthContext.tsx:28` — `select('*')` → explicit granted
        columns; merge `email` into the user object from the **auth session**
        (`session.user.email`), which the account page already renders.
      - `src/app/admin/users/page.tsx:36` — `select('*')` in the browser →
        new `GET /api/admin/users` (service-role, admin-checked) returning
        emails; page fetches that.
      - `src/app/admin/page.tsx` recent-users query selects `email` in the
        browser → same API route (limit param) or drop email from the card.
      - Embeds `profile:profiles(*)` → explicit column list (no email) in:
        `src/services/artists.ts:7`, `src/app/api/artists/route.ts:10`,
        `src/app/api/artists/[slug]/route.ts:9`,
        `src/app/api/galleries/route.ts:8`,
        `src/app/(public)/artist/[slug]/page.tsx:43`,
        `src/app/(public)/gallery/[slug]/page.tsx:47,52`.
      - `src/app/api/commissions/route.ts:74` selects `email` with the
        **user-context** client (works today only via the broad policy) →
        switch to `createAdminSupabaseClient()`.
      - Verified fine already: unsubscribe route, drips cron, webhook,
        messages route (all service-role).
- [ ] **Verify on DEV:** anon REST `profiles?select=email` → error;
      `?select=id,full_name` → rows; login works; account page shows email;
      admin users page shows emails; commission request still emails artist.

### 1.2 Escape user content in ALL email templates
`escapeHtml()` exists in `src/services/email.ts` but only 2 of ~16 senders
use it. A user can set `full_name` to a phishing `<a>` and it renders in
genuine Custom Canvas email.
- [ ] Wrap every interpolated user-controlled value in every sender:
      names, listing/commission titles, message previews, review comments,
      tracking numbers. Strip `\r\n` from subject interpolations.
- [ ] **Verify:** render each template with `<a href=x>evil</a>` payloads →
      inert text.

### 1.3 Freeze conversation membership
Participants can UPDATE `participant_one/two` (no column guard) → hand a
private thread to a third party.
- [ ] Same migration: `guard_conversations_update()` BEFORE UPDATE trigger
      freezing both participant columns + `context_id/context_type` for
      non-privileged callers (mirror `guard_messages_update`).
- [ ] **Verify (DEV psql):** participant JWT UPDATE of `participant_two` →
      frozen; commissions route's legitimate `context_id` update still works
      (it uses user context! → route to admin client or allow context_id;
      check at build time).

### 1.4 PR gate
tsc, lint, build, Playwright smoke vs staging, anon-probe script output
pasted into the PR description. Merge → **apply migration to PROD the same
day** (site is live).

## PR-2 `feat/artist-approval` completion — finish the gate (blocks merge)
*~1 day on the existing branch.*

### 2.0 Draft → submit → pending (new flow decision)
- [ ] Migration `00032_application_submit.sql`: add `'draft'` to the
      `application_status` CHECK; INSERT guard forces `'draft'`;
      admin-notify trigger fires only on transitions INTO `'pending'`;
      backfill: DEV/staging rows currently `'pending'` with no real
      submission → move to `'draft'` (nobody is in a queue yet).
- [ ] `POST /api/artist/submit` — CAS `draft|rejected → pending`
      (`.in('application_status', ['draft','rejected'])` + rowcount, 409
      otherwise, clears rejection fields). Delete `/api/artist/resubmit`.
- [ ] Studio banner states: `draft` → "Finish your shop, then submit for
      review" (no submit button here — the checklist owns submission, PR-6);
      `pending` → "In review"; `rejected` → reason + "Fix & resubmit".

### 2.1 The listing leak (BLOCKER — two reviewers independently confirmed)
`is_live` gates the artist DIRECTORY but no listing surface. A pending
artist's listing is in the public feed, autocomplete, sitemap, facets, and
purchasable.
- [ ] Migration `00033_listing_visibility.sql`: replace public `listings`
      SELECT policy — readable iff `status NOT IN ('hidden','draft')` AND
      owning artist `is_live`, OR owner, OR admin (EXISTS subquery on
      artist_profiles; keep 00028 admin policy).
- [ ] Belt-and-braces app filters (`artist_profiles.is_live=true`) in
      `runFeedQuery`, autocomplete listings, **filter facets** (facets read
      artist_profiles directly — RLS on listings doesn't cover them),
      gallery-roster queries, sitemap listings (confirm anon context).
- [ ] `listing_images` / `listing_tags` SELECT policies: verify they don't
      independently leak (join-scoped to listings → covered; check).

### 2.2 Gate the public pages
- [ ] `/artist/[slug]` + its `opengraph-image.tsx`: `notFound()` unless
      `is_live` OR viewer is owner OR admin. Add `?preview=1` to the admin
      queue's View-profile link so `PreviewBanner` shows.
- [ ] `/listing/[id]` + OG: falls out of 2.1's RLS for anon (null → 404);
      add explicit owner/admin fetch path so previews still render.

### 2.3 Service-role side channels
- [ ] Skip new-listing/price-drop email fan-out + follower notifications
      when artist not live (`src/lib/listingAlerts.ts` + 00025 stamps).
      No retroactive fan-out on approval (decision).

### 2.4 Route hardening
- [ ] Admin decision route: CAS `.eq('application_status','pending')` +
      rowcount → 409; check every update/insert error BEFORE side effects
      (no "you're live!" email on a failed update); malformed JSON → 400.
- [ ] Two-admin race, approve-after-reject: covered by CAS; test both.

### 2.5 Hide review columns from public reads
`rejection_reason`, `reviewed_by/at`, `stripe_account_id` are world-readable
via `artist_profiles` `USING(true)`.
- [ ] Reroute the two legit client readers first: admin queue →
      `GET /api/admin/applications` (service-role); Studio banner/checklist →
      `GET /api/artist/application` (self, service-role). Update
      `useOwnArtistProfile` to drop revoked columns.
- [ ] Same revoke-then-grant mechanic as 1.1 on `artist_profiles` (grant
      list = presentation columns; excludes the four above).
      Sweep client-context `select('*')` on artist_profiles → explicit lists
      (grep shows ~6 sites incl. `services/artists.ts`, `follows`, gallery
      dashboard).
- [ ] **Verify:** anon `?select=rejection_reason` → error; queue, banner,
      public pages all render.

### 2.6 Defense-in-depth + coherence
- [ ] Checkout route rejects when listing's artist not live; commission-create
      and conversation-create reject non-live target artists.
      (Stripe Connect onboarding stays OPEN to draft/pending artists —
      deliberate: KYC runs during review.)
- [ ] Drip cron: only `application_status='draft'` artists get nudges;
      copy rewritten to "finish and submit" (accurate again under the
      submit flow); rejected artists excluded.
- [ ] Seed scripts: `application_status='approved'` with `is_live=True`;
      seed one draft + one pending artist for staging queue testing.
- [ ] Banner/queue polish: React Query invalidation after submit; surface
      409 messages; queue page surfaces load errors; drop stray
      `test-results/.last-run.json`; .gitignore playwright dirs.

### 2.7 PR gate
DEV verification matrix: pending artist invisible on feed/API/detail/
sitemap/autocomplete/facets/OG (anon probes); visible to self + admin;
approve → fully visible + email; reject → dark + reason + resubmit → 409
races (two-admin, approve-vs-submit). Playwright suite green. Then merge
into master AFTER PR-1.

## PR-3 `fix/refund-flow` — money correctness (before payments flip)
*~1 day + Stripe test-mode verification. Fee math itself verified correct —
$100 → artist $95; $1000 → artist $860 (cap engaged); parts sum exactly.*

- [ ] **3.1 Crash-safe settle**: migration `00035_refund_bookkeeping.sql`
      (orders: `stripe_refund_id`, `stripe_reversal_id`, `amount_tax_cents`);
      Stripe idempotency keys on refund/reversal/oversell-refund/checkout
      creation; persist refund id immediately after refund succeeds so a
      retry skips to the reversal (kills the wedge where retry re-refunds
      and can never succeed); CAS the status update → concurrent settle 409s.
- [ ] **3.2 Refund the tax** (merchant-of-record obligation): capture
      `session.total_details.amount_tax` at webhook time; refund =
      price + shipping + their tax (service fee + its tax retained);
      admin dialog + terms updated to say "incl. tax".
- [ ] **3.3 Relist policy**: auto-relist only never-shipped orders
      (`status='paid'`); shipped/delivered → stays `sold`, artist relists
      manually. Align admin route + webhook mirror; both clear
      `sold_price_cents`.
- [ ] **3.4 Webhook**: honor `payment_status==='paid'` on
      `checkout.session.completed` (delayed methods are one dashboard toggle
      away); log-and-ignore otherwise.
- [ ] **3.5 Dashboard-refund reconciliation**: `charge.refunded` with no
      transfer reversal → loud admin notification + Sentry, not a silent
      close.
- [ ] **3.6 `buildOrderRecord`**: delete the fictional legacy-$10-fee and
      live-listing-price fallbacks — missing metadata → 500 (Stripe
      retries), never fabricated numbers.
- [ ] **3.7 Zod-validate shipping payload**; cap Stripe metadata values
      (500-char limit).
- [ ] **PR gate**: Stripe test-mode on staging — purchase with tax → settle
      refund (amounts verified to the cent) → simulated crash between refund
      and reversal → retry completes → double-settle 409s.

## PR-4 `feat/l2-hardening` polish — then merge it
*~half day on the existing branch.*
- [ ] **4.1** Rewrite the Stripe money E2E against the real flow (listing →
      `/checkout/[id]` shipping form → full-page `checkout.stripe.com` via
      page-level `getByLabel` — hosted checkout is a redirect, NOT an iframe
      → `/orders?success=true` "Your purchase was successful" banner). Keep
      behind `E2E_PAYMENTS=1`.
- [ ] **4.2** Middleware: `timeout: 1000` on Ratelimit (default 5s would
      stall every API call if Upstash slows); `console.error` in the
      fail-open catch (a bad token currently degrades silently forever).
- [ ] **4.3** Playwright: html reporter (`open:'never'`) + upload
      `playwright-report/` AND `test-results/` (traces) on failure.
- [ ] **4.4** CI-vs-deploy race: `/api/version` route returning
      `VERCEL_GIT_COMMIT_SHA`; e2e job polls staging until deployed SHA ==
      `GITHUB_SHA` (5-min cap) — today it can green-light the previous
      deploy.
- [ ] **4.5** load-check.mjs: `started < total`; nearest-rank percentile;
      exclude error latencies from percentiles.
- [ ] **4.6** Runbook: webhook idempotency wording (payment-intent dedupe on
      checkout.session.completed only); drop stale `/api/reports` limit.

## PR-5 `feat/artist-onboarding` — checklist + photo guidance (Chris priority)
*~1 day, after PR-2 merges.*
- [ ] **5.1 Setup checklist card** (Studio home, above stats): rows =
      profile photo, story 100+, mediums, neighborhood, fulfillment pref,
      banner, first listing (target: 3+ photos), Stripe connected — each a
      check + deep link, progress bar (reuse `completeness_score` inputs,
      computed client-side from the same signals so rows check off live).
      Final row: **Submit for review** button (enabled when essentials
      done: photo, story, ≥1 listing) → `POST /api/artist/submit` →
      card flips to "In review" state. After approval → collapses to a
      "You're live" row with link to public page.
- [ ] **5.2 Photo guidance**: "Great photos sell art" expandable panel in
      the image uploader (create + edit listing): natural indirect light /
      straight-on & level / fill the frame / no flash glare / one detail
      close-up / one in-room shot. Linked from the checklist listing row.
- [ ] **5.3** TESTING.md gains the checklist + submit path.

## PR-6 `feat/artist-services` — photographer directory v0
*~half–1 day.*
- [ ] **6.1** Migration `000XX_artist_services.sql`: `artist_services`
      (name, category `photographer|framing|other`, blurb, city, contact
      email/phone/url, is_active, display_order); RLS: authenticated read of
      active rows (artist-facing, not a public marketing surface); writes
      service-role only.
- [ ] **6.2** `/admin/services` CRUD (add/edit/deactivate/reorder).
- [ ] **6.3** `/studio/services` "Art photography & more" — active providers,
      "Contact directly" mailto/link, explicit copy that booking/payment is
      with the provider. Linked from checklist photo row ("Want pro
      photos?") + Studio nav.
- [ ] **6.4** Content from Chris: 1–3 vetted Houston photographers
      (name/contact/blurb/rate range).

## PR-7 `docs` — truth pass (can ride any late PR)
- [ ] LAUNCH.md + GO-LIVE-PLAN.md: domain → **customcanvas.shop** everywhere
      (docs still say getcustomcanvas.com — following them verbatim breaks
      every email link); prod-creation sections marked DONE; migration list
      through 00034; approval + submit steps added to the smoke test;
      delete `REVIEW-FIX-PLAN.md` (superseded by this doc).
- [ ] custom-canvas-testing.md: "Artist approval & submission" section;
      URLs/sender refreshed; videos mention dropped.
- [ ] Stale fallbacks: robots/sitemap/metadataBase `customcanvas.art` →
      `.shop`; email module throws in prod if `EMAIL_FROM` unset.
- [ ] Delete dead `sendWelcomeEmail`; remove dead `artist_videos` query on
      the artist page; 404 CTA → `/` + `/about`; sitemap `/galleries` →
      `/partners`; Featured/Partner shelves labeled with their city.

---

# TRACK B — Chris (business). Runs in parallel with Track A.

- [ ] **B1. Stripe live activation** (~30 min, unblocked now the bank
      exists): Stripe Dashboard → Activate account (LLC, EIN, bank) →
      Settings → Connect: enable **Express** → More → Tax: enable, set
      origin address, add **Texas registration** → statement descriptor
      `CUSTOMCANVAS`. Then copy `pk_live_…` and `sk_live_…` (keep them in
      the dashboard — I never need to see them).
- [ ] **B2. Dashboard toggles** (~10 min): create a free Upstash Redis
      (region: same as Vercel functions, iad1/us-east) and paste
      `UPSTASH_REDIS_REST_URL/TOKEN` into Vercel `custom-canvas-prod` env;
      Vercel → Analytics → enable Analytics + Speed Insights; BetterStack
      free monitor on `https://customcanvas.shop/`; Sentry → alert rule →
      email.
- [ ] **B3. Legal hour (recommended before real money)**: startup lawyer
      pass on Terms/Privacy — marketplace liability, artist-mediated
      refunds, Connect agreement, Texas marketplace-facilitator language.
- [ ] **B4. Photographer contacts** for the services directory (PR-6.4).
- [ ] **B5. Artist pipeline**: build the list of 15–25 Houston artists
      (partner orgs, art schools, gallery contacts) while Track A finishes.
      This is the true long pole of launch.

---

# 🚀 FINAL SEQUENCE — GO FULLY LIVE
*Run top to bottom once Track A PRs 1–5 are merged and B1–B2 are done.
PR-6/7 are nice-to-have before public announce, not gates. Each step names
its owner. Nothing here is optional except where marked.*

### Stage 1 — Production infrastructure catch-up (me, ~1 hour)
1. [x] Apply migrations to **PROD** Supabase in order:
       `00030 … 00038` — approval gate, submit flow, listing visibility,
       column privacy, refund bookkeeping, visibility follow-through,
       artist-agreement columns, and launch hardening (order forgery,
       order status guard, listing_series, blocking, review attribution)
       — via the session pooler; verify each with the same psql probes
       used on DEV. **Apply ALL of them: stopping short of 00036 reopens
       the anon draft-artwork leak, and skipping 00037 makes every
       artist 'Submit for review' 500.** (00030–00038 done 2026-08-25.)
2. [ ] Anon-probe PROD: emails unreadable, rejection reasons unreadable,
       no non-live listings/artists visible. (Existing 7 demo artists were
       backfilled `approved` — decide: keep demo artists on prod or purge
       to zero for a clean launch. **Recommend purge** — real supply only;
       staging keeps the demo set.)
3. [ ] Confirm prod crons, Realtime (messages/notifications), storage
       buckets — one pass down LAUNCH.md's checklist against reality.

### Stage 2 — Stripe live wiring (Chris pastes, I verify; ~30 min)
4. [ ] Chris: Vercel `custom-canvas-prod` → env → set
       `STRIPE_SECRET_KEY=sk_live_…`,
       `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` (Production scope).
5. [ ] Chris: Stripe Dashboard → Developers → Webhooks → Add endpoint
       `https://customcanvas.shop/api/webhooks/stripe`, events:
       `checkout.session.completed`, `account.updated`, `charge.refunded`,
       `payment_intent.payment_failed`, `charge.dispute.created`,
       `charge.dispute.closed` → copy `whsec_…` → Vercel env
       `STRIPE_WEBHOOK_SECRET`.
6. [ ] Chris: Stripe → Settings → Branding → upload the brushstroke assets
       (`brand/stripe-branding/`).
7. [ ] Me: redeploy prod, verify boot, webhook test event from the Stripe
       dashboard returns 200.

### Stage 3 — Flip payments + REAL-MONEY smoke test (both of us, ~1 hour)
8. [ ] Me: set `NEXT_PUBLIC_PAYMENTS_ENABLED=true` on prod → redeploy.
9. [ ] Chris (or a real test artist account Chris controls): complete
       Stripe Express onboarding on PROD with real details → artist shows
       `stripe_onboarded`.
10. [ ] **The real transaction**: buyer account purchases a real listing
        with a real card (small, e.g. $20 + shipping): verify on prod —
        order created, tax collected and correct for a TX address, fee line
        = 5% capped $15, artist payout visible in the connected account,
        both emails arrive from `noreply@customcanvas.shop`, listing flips
        sold, admin dashboard GMV ticks.
11. [ ] **The real refund**: run the full artist-mediated flow on that
        order — buyer requests in chat → artist approves in Studio → admin
        settles → verify to the cent: buyer refunded price+shipping+tax
        (fee kept), transfer reversal hits the connected account, order
        `refunded`, payout balance back to zero.
12. [ ] **The approval flow on prod**: fresh artist signup → checklist →
        submit → Chris approves from `/admin/applications` → shop visible;
        reject/resubmit path once too.
13. [ ] Payout landing: wait for Stripe's first payout cycle (2–7 days for
        a new account) and confirm money reaches the test artist's real
        bank. (Don't block launch on this — verify it landed during soft
        launch week.)

### Stage 4 — Supply seeding (Chris-led, me supporting; 1–3 weeks, the long pole)
14. [ ] White-glove onboard the first **15–25 Houston artists** (B5 list):
        walk each through signup → checklist → photos (point them at the
        photo guide + services directory) → submit → approve same-day.
        Target: 3+ listings each, every one Local Verified.
15. [ ] Curate: Featured shelf full (10), partner picks live, hero/city
        shelves reviewed on a clean browser.
16. [ ] Me: reseed nothing on prod — real content only. Staging keeps demo.

### Stage 5 — Soft launch (1–2 weeks)
17. [ ] Invite-only: artists announce to their own followings; friends &
        family buy real pieces.
18. [ ] Watch daily (both): Sentry issues, Stripe payments/disputes, admin
        GMV dashboard, BetterStack uptime, refund requests. Fix fast; I
        stay on call for same-day patches.
19. [ ] Confirm first real artist payouts landed (step 13 follow-through).

### Stage 6 — Public launch 🎉
20. [ ] Chris: announce Houston — local press angle ("85% to artists,
        Houston-first"), partner orgs amplify, artists post their shops.
21. [ ] Me (launch week): monitor error rates + p95, tune rate limits with
        real traffic, triage feedback into a post-launch backlog.
22. [ ] Success metrics live from day one: GMV (north star), live artists,
        listings/artist, signups, save→purchase rate, per-city density —
        all already on the admin dashboard.

### Standing rule after launch
Scale NOTHING until a trigger fires (GO-LIVE-PLAN §L4 tiers stay valid):
~1k users = current stack; ~10k = email queue + event rollups; ~100k =
For-You page + dedicated search. Win Houston first.

---

## Timeline at a glance

| When | Track A (me) | Track B (Chris) |
|---|---|---|
| Days 1–2 | PR-1 security → merge+deploy; PR-2 gate completion | B1 Stripe activation, B2 toggles |
| Days 3–4 | PR-5 checklist+photos; PR-6 services → **artist onboarding unblocked** | B3 legal hour, B4 photographers, B5 artist list |
| Days 5–6 | PR-3 refunds; PR-4 hardening merge; PR-7 docs | begin Stage-4 artist outreach early |
| Day 7 | Stages 1–3: prod migrations, Stripe wiring, real-money smoke | Stages 2–3 with me |
| Weeks 2–4 | on-call support, fixes | Stage 4: onboard 15–25 artists |
| Then | Stage 5 soft launch → Stage 6 public | announce Houston |

**Honest critical path: artist recruitment (Stage 4).** Everything technical
fits inside its shadow. Total code work remaining: ~4–5 days.
