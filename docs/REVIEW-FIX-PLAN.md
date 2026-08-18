# Review Fix Plan — 2026-08-15 five-lens review

*Source: five independent review passes (approval-gate diff, L2-hardening diff,
whole-app security/RLS, money paths, launch readiness). Every blocker was
re-verified against the code before landing here. Work is organized as five
PRs in merge order; each phase ends with its own verification gate. Check
items off as they land.*

**Merge order: P1 security → P2 approval-gate completion → P3 refunds/money →
P4 hardening polish → P5 docs & product polish.** P1 goes first because the
site is live today and the PII exposure is exploitable now; P2 second because
the approval branch must not merge half-built; P3 before payments ever flip
on; P4/P5 before artists onboard.

---

## P1 — Pre-existing security fixes (new branch `fix/security-rls` off master)
*~half day. Deployable to prod immediately; nothing here depends on the two
feature branches.*

- [ ] **P1.1 Stop anonymous email harvesting** (`profiles` SELECT is
      `USING (true)`; RLS is row-level, so the public anon key returns
      `email` for every user).
      - Enumerate every **client-context** read of `profiles` that uses
        `select('*')` or requests `email` (grep `profiles(` embeds +
        `.from('profiles')` in src/) and convert to explicit column lists
        (`id, full_name, avatar_url, role, ...`). Server/service-role reads
        are unaffected.
      - Confirm the account page reads the user's own email from the auth
        session (`user.email`), not the `profiles` row; fix if not.
      - Migration `000XX_profiles_column_privacy.sql`:
        `REVOKE SELECT (email, email_preferences) ON profiles FROM anon, authenticated;`
      - **Verify (DEV psql + REST):** anon `select=email` → permission error;
        anon `select=id,full_name` → OK; app browse/messaging/reviews all
        still render names/avatars.
- [ ] **P1.2 Escape user content in every email template**
      (`src/services/email.ts` — `escapeHtml()` exists but only 2 of ~16
      senders use it). Wrap **every** interpolated user/artist/admin-supplied
      value (names, titles, message previews, rejection reason) in
      `escapeHtml()`. Subjects too (no HTML there, but strip newlines to
      block header-style injection).
      - **Verify:** unit-style check rendering each template with
        `<a href=x>` / `<img src=x>` payloads → all render inert.
- [ ] **P1.3 Freeze conversation membership** — participants can currently
      UPDATE `participant_one/two` and hand a private thread to anyone.
      Migration: `guard_conversations_update()` BEFORE UPDATE trigger freezing
      both participant columns for non-privileged callers (mirror
      `guard_messages_update`).
      - **Verify (DEV psql):** authenticated participant UPDATE of
        `participant_two` → columns frozen; normal metadata updates still work.
- [ ] **P1.4 (P3-priority, do only if trivial) analytics spoofing** — anon
      inserts can credit arbitrary `artist_id`. Acceptable post-launch risk;
      note in runbook, revisit at Tier 2.

## P2 — Finish the approval gate (on `feat/artist-approval`)
*~1 day. Blocks that branch's merge. Two reviewers independently confirmed the
gate currently hides artists from the DIRECTORY but not their LISTINGS.*

- [ ] **P2.0 Submit-for-review flow (Chris decision 2026-08-18)**: artists no
      longer enter the queue at signup — they build first, then explicitly
      submit. Migration `00031_application_submit.sql`: add `'draft'` to the
      `application_status` CHECK; INSERT guard forces `'draft'` (not
      `'pending'`); admin-notify trigger fires only on transition INTO
      `'pending'`. New `POST /api/artist/submit` (CAS: `draft|rejected` →
      `pending`, 409 otherwise) replaces `/api/artist/resubmit` (one route,
      both cases). Studio banner gets a `draft` state ("finish your shop,
      then submit for review"). Queue/UI unchanged (pending only).

- [ ] **P2.1 Systemic visibility fix — migration `00031_listing_visibility.sql`**:
      replace the public `listings` SELECT policy so a listing is publicly
      readable only when its owning artist `is_live` — with owner and admin
      bypass (owner: `artist_id IN (own artist_profiles)`; admin: existing
      00028 pattern). One policy closes: home feed, `/api/listings`, listing
      detail, RelatedListings, OG image, autocomplete, sitemap, gallery
      rosters.
      - Belt-and-braces: also add `.eq('artist_profiles.is_live', true)` in
        `runFeedQuery`, autocomplete listings, and **filter facets**
        (`feed.ts` facet queries — otherwise pending artists' neighborhoods/
        schools still appear as filter options since facets read
        artist_profiles directly).
      - Check `sitemap.ts` listings query runs in anon context (then RLS
        covers it) — if service-role, add an explicit filter.
- [ ] **P2.2 Gate the two public pages**: `/artist/[slug]` and `/listing/[id]`
      → `notFound()` when not `is_live`, unless viewer is the owner or an
      admin (preserves the artist's own preview and the admin queue's "View
      profile" link — add `?preview=1` to that link so the preview banner
      shows). Listing page mostly falls out of P2.1's RLS (anon fetch returns
      null → already 404s); make the artist page check explicit. Same for both
      `opengraph-image.tsx` files.
- [ ] **P2.3 Suppress publish fan-out for non-live artists**: check the
      new-listing / price-drop email fan-out (`src/lib/listingAlerts.ts`,
      00025 stamps) and follower notifications — they run service-role, so
      RLS won't stop them. Skip when the artist isn't live. Decision: **no**
      retroactive fan-out on approval (keep simple; their followers are ~zero
      pre-approval anyway).
- [ ] **P2.4 Admin decision route hardening**
      (`/api/admin/applications/[id]`): compare-and-swap
      (`.eq('application_status','pending')` + rowcount check) → 409 if
      already decided; check every update/insert error **before** sending
      notifications/emails; malformed JSON body → 400.
- [ ] **P2.5 Submit route CAS** — superseded by P2.0's unified
      `/api/artist/submit` (CAS `draft|rejected` → `pending`, rowcount check,
      409 otherwise; never touches `is_live`). Delete `/api/artist/resubmit`.
- [ ] **P2.6 Hide the review columns from public reads**: `rejection_reason`,
      `reviewed_by`, `reviewed_at` (+ pre-existing `stripe_account_id`) are
      world-readable via `artist_profiles` `USING(true)`.
      - Route the two legit client readers through service-role APIs first:
        admin queue page → new `GET /api/admin/applications` (admin-checked);
        Studio banner → extend an own-profile API read or new
        `GET /api/artist/application` (self). Update `useOwnArtistProfile`
        to stop selecting the revoked columns.
      - Then `REVOKE SELECT (rejection_reason, reviewed_by, reviewed_at,
        stripe_account_id) ON artist_profiles FROM anon, authenticated;`
      - Sweep client-context `select('*')` on `artist_profiles` (each would
        now 42501) → explicit column lists. This is the fiddly one — grep
        first, count call sites, then decide explicit-lists vs a public view.
      - **Verify:** anon REST `select=rejection_reason` → error; admin queue
        + banner + public artist page all still work.
- [ ] **P2.7 Defense-in-depth on money/contact paths**: checkout route
      rejects when the listing's artist isn't live; commission-create and
      conversation-create reject when the target artist isn't live. (Stripe
      Connect onboarding stays OPEN to pending artists — deliberate: KYC
      takes days, let them run it during review so approval = instantly
      sellable.)
- [ ] **P2.8 Drip cron sanity** (`/api/cron/onboarding-drips`): exclude
      `application_status='rejected'`; rewrite day-3/day-7 copy to
      review-aware wording ("your application is in review — here's how to
      make your shop shine") — pending artists can no longer self-publish,
      so "go live now" copy is wrong.
- [ ] **P2.9 Seed scripts** (`scripts/seed_demo.py`): insert
      `application_status='approved'` alongside `is_live=True` (prevents the
      queue flood + live-but-pending corruption); seed **one** extra pending
      artist so the queue is testable on staging.
- [ ] **P2.10 Banner cache fix** (`ReviewStatusBanner`): on resubmit success
      invalidate `['own-artist-profile']`; surface the server's 409 message
      instead of the generic failure toast.
- [ ] **P2.11 Queue page polish**: surface load errors (no silent "No
      applications waiting" on query failure).
- [ ] **P2.12 Escape `rejection_reason` + names in the two new emails**
      (folded into P1.2 if P1 merges first — verify on this branch after
      rebase).
- [ ] **P2.13 Branch hygiene**: drop `test-results/.last-run.json`; add
      `test-results/`/`playwright-report/` to .gitignore here too.
- [ ] **P2 verification gate**: on DEV — anon REST + browser: pending
      artist's listing absent from feed/API/detail/sitemap/autocomplete/
      facets; pending profile URL 404s for anon, renders for owner & admin;
      approve → everything visible; reject → dark again + banner shows
      reason; resubmit race (approve-vs-resubmit) → 409; two-admin race →
      one 409. Rerun Playwright suite. tsc/lint/build clean.

## P3 — Refund & money correctness (new branch `fix/refund-flow`, before payments flip)
*~1 day + Stripe test-mode verification. None of this is reachable until
Stripe goes live, but it must merge before `NEXT_PUBLIC_PAYMENTS_ENABLED=true`.*

- [ ] **P3.1 Make settle-refund crash-safe** (`/api/admin/orders/[id]/refund`):
      - Migration `00032_refund_bookkeeping.sql`: add
        `stripe_refund_id TEXT`, `stripe_reversal_id TEXT`,
        `amount_tax_cents INT` to orders.
      - Stripe **idempotency keys** on `refunds.create`,
        `transfers.createReversal` (key = order id + purpose), and the
        webhook's oversell refund.
      - Persist each step: write `stripe_refund_id` immediately after the
        refund succeeds; a retry sees it and **skips straight to the
        reversal** (fixes the wedge where retry re-attempts the full refund
        and can never succeed).
      - CAS the final status update (`.neq('status','refunded')` guard) →
        second concurrent settle gets 409, not a Stripe error.
- [ ] **P3.2 Refund the tax** (merchant-of-record obligation): capture
      `session.total_details.amount_tax` into `amount_tax_cents` at webhook
      time; refund = price + shipping + tax attributable to those lines
      (i.e. everything except the service fee and its tax). Verify the math
      against a Stripe test-mode purchase with tax enabled; update the
      admin confirm-dialog copy and terms wording to say "incl. tax".
- [ ] **P3.3 Relist policy**: auto-relist ONLY when the order was never
      shipped (`status='paid'`); shipped/delivered → listing stays `sold`,
      artist manually relists after the piece comes back. Align the admin
      route and the webhook mirror; both clear `sold_price_cents`
      consistently.
- [ ] **P3.4 Webhook `payment_status` check**: treat
      `checkout.session.completed` as paid only when
      `payment_status === 'paid'`; log-and-ignore otherwise (card-only
      today; delayed methods are one dashboard toggle away).
- [ ] **P3.5 Dashboard-refund reconciliation** (`charge.refunded` handler):
      if the transfer was NOT reversed, notify admins loudly (in-app +
      Sentry) instead of silently closing the order; respect the P3.3
      relist rule.
- [ ] **P3.6 `buildOrderRecord` fallbacks**: delete the fictional legacy
      $10-fee fallback and the live-listing price fallback — missing
      metadata → 500 (Stripe retries) rather than fabricated numbers.
- [ ] **P3.7 Zod-validate the shipping payload** in checkout (field lengths,
      allowlisted keys) and cap what goes into Stripe metadata (500-char
      limit per value).
- [ ] **P3 verification gate**: full Stripe test-mode cycle on staging —
      purchase (tax visible) → settle refund → buyer gets price+shipping+tax,
      fee kept, reversal exact; kill the route between refund and reversal
      (simulate) → retry completes cleanly; double-settle → 409.
- [ ] **OPEN PRODUCT QUESTION (Chris)**: commissions move **no money** —
      quote/accept exists, deposits are referenced in the DB but unbuilt, so
      commission payment happens off-platform. OK for launch, or build
      deposits before announcing? (Plan assumes: OK for launch, revisit
      post-launch.)

## P4 — Hardening-branch polish (on `feat/l2-hardening`)
*~half day.*

- [ ] **P4.1 Rewrite the Stripe money E2E test** against the REAL flow:
      listing page → "Buy Now" link → `/checkout/[id]` shipping form →
      submit → full-page `checkout.stripe.com` (page-level `getByLabel`,
      NOT frameLocator — hosted checkout is a redirect, not an iframe) →
      `/orders?success=true` banner ("Your purchase was successful").
      Fix the home-feed listing-card selector too. Keep it opt-in behind
      `E2E_PAYMENTS=1`.
- [ ] **P4.2 Middleware tuning**: `timeout: 1000` on the Ratelimit config
      (default is 5s — a slow Upstash would stall every API call);
      `console.error` (edge-safe) in the fail-open catch so a bad token is
      visible instead of silently degrading forever. Runbook note: pick an
      Upstash region colocated with Vercel functions.
- [ ] **P4.3 Playwright artifacts**: add `reporter: [['list'], ['html',
      { open: 'never' }]]`; upload both `playwright-report/` and
      `test-results/` (traces) on failure.
- [ ] **P4.4 CI-vs-deploy race**: add a tiny `/api/version` route returning
      `VERCEL_GIT_COMMIT_SHA`; CI e2e job polls staging until the deployed
      SHA matches `GITHUB_SHA` (5-min cap) before running tests — today it
      can green-light against the PREVIOUS deploy.
- [ ] **P4.5 load-check.mjs cleanups**: loop condition → `started < total`;
      nearest-rank percentile (`ceil(p/100*n)-1`); exclude error-latencies
      from percentiles (report separately).
- [ ] **P4.6 Runbook accuracy**: webhook idempotency wording (dedupe is by
      payment-intent on `checkout.session.completed` only — there is no
      event-id table); drop the stale `/api/reports` limit entry.

## P5 — Docs & product polish (small PR, before onboarding artists)
*~half day.*

- [ ] **P5.1 LAUNCH.md + GO-LIVE-PLAN.md truth pass**: domain →
      **customcanvas.shop** everywhere (docs still say getcustomcanvas.com —
      following §5 verbatim would break every email link); mark prod-create
      sections DONE (prod exists and is live); migration list through 00032;
      add the admin-approval step to the §8 smoke test.
- [ ] **P5.2 Testing doc**: new "Artist approval" section (pending banner,
      hidden-until-approved incl. direct-URL 404, approve → live + email,
      reject → reason + resubmit, re-review); refresh URLs/sender; drop the
      videos mention.
- [ ] **P5.3 Stale fallbacks**: robots/sitemap/metadataBase fallbacks
      `customcanvas.art` → `customcanvas.shop`; email module throws in prod
      when `EMAIL_FROM` unset.
- [ ] **P5.4 Delete dead `sendWelcomeEmail`** (zero callers; onboarding has
      no server touchpoint to send it from; drips + approval emails cover the
      moment). Its pre-gate copy would be wrong anyway.
- [ ] **P5.5 Artist page**: remove the dead `artist_videos` query (6 queries,
      5 destructured); drop the videos-bucket line from LAUNCH.md.
- [ ] **P5.6 Shelf honesty**: label Featured/Partner-picks shelves with their
      city ("Featured in Houston") so a Denver visitor isn't shown Houston
      art under a Denver headline.
- [ ] **P5.7 404 + sitemap**: 404 CTA → `/` + `/about` (not the empty
      partners page); sitemap `/galleries` → `/partners` (currently lists a
      redirecting URL).

## P6 — Artist onboarding UX (new branch after P2 merges; Chris priority 2026-08-18)
*~1 day. The self-serve path that makes onboarding 15–25 artists easy.*

- [ ] **P6.1 Setup checklist card in Studio**: turn the existing
      `completeness_score` items into a visible checklist — profile photo,
      story (100+ chars), mediums, neighborhood, fulfillment preference,
      banner, first listing, Stripe connected — each row a checkmark +
      deep-link to where you do it, with a progress bar. Final step:
      **Submit for review** (enabled when the essentials are done), wired to
      `/api/artist/submit`. After submit → shows review status; after
      approval → card collapses to done.
- [ ] **P6.2 Photo guidance at the point of upload**: "Great photos sell
      art" expandable panel in the listing image uploader (create + edit):
      natural indirect light, straight-on + level, fill the frame, no flash
      glare, one detail close-up, one in-room context shot. Same panel
      linked from the checklist's listing step. Keep it text+layout (no
      video production).
- [ ] **P6.3 Photo quality as a first-class checklist item**: listing step
      shows "3+ photos on your first listing" as the target.

## P7 — Artist Services directory v0 (small PR, after P6)
*~half–1 day. Validates the seller-services idea with zero payment plumbing.*

- [ ] **P7.1 Migration**: `artist_services` table (name, category —
      photographer first, blurb, city, contact email/phone/site, is_active,
      display_order); RLS: public/authenticated read of active rows, writes
      via admin-checked API only.
- [ ] **P7.2 Admin CRUD**: `/admin/services` — add/edit/deactivate/reorder
      entries.
- [ ] **P7.3 Artist-facing page**: `/studio/services` ("Art photography &
      more") listing active providers with a "Contact directly" action;
      linked from the Studio checklist's photo step ("Want pro photos?") and
      Studio nav. Copy is explicit that booking/payment is directly with the
      provider.
- [ ] **P7.4 Seed**: Chris supplies 1–3 vetted Houston photographers to list
      at launch (name/contact/rate blurb) — content, not code.

---

## Explicitly NOT doing (decisions, revisit post-launch)
- Full photographer booking/payments marketplace — directory v0 first
  (Chris decision 2026-08-18); build booking only if artists use it.
- Retroactive new-listing fan-out on artist approval (P2.3) — keep simple.
- Analytics spoofing hardening (P1.4) — Tier-2 item.
- Commission deposits — pending Chris's call (P3 open question).
- Buyer-facing "artist not live yet" page — plain 404 is fine at this scale.

## Verification summary (what "done" means)
Every phase: `tsc --noEmit`, `lint`, `build`, Playwright suite green vs
staging. P1/P2: anon-REST probes against DEV proving each exposure closed.
P3: full Stripe test-mode refund cycle incl. simulated partial failure.
Final: one manual pass of the new TESTING.md approval section on staging.
