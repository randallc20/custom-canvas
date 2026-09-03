# Review Fix Plan — the five-pass remediation arc

*Written 2026-09-02, immediately after the five report-only review passes in
`docs/reviews/01`–`05` (prompt: `docs/REVIEW-PROMPT.md`). Those passes read the
whole codebase in five scoped sessions and produced 1 P0, 5 P1s, 33 P2s, and
13 P3s, plus appendices. Nothing has been fixed. This plan sequences all of it
around the one hard gate the product has: Stripe live activation. It is written
to be executed cold, in fresh conversations, phase by phase. Every phase is
independently shippable and reviewable.*

**The shape.** Tier 1 (R1–R4) is money and state corruption: it lands before
Stripe goes live. Tier 2 (R5–R9) is what real users hit in normal flows: it
lands before the public push. Tier 3 (R10–R11) is maintainability and tests,
batched. R12 re-runs the two review passes most likely to regress.

**Ground rules for the implementing session**
- Work in a worktree off `master`; branch per phase (`review/r1-account-delete`
  etc.); merge to master after the phase's verification passes. Staging
  auto-deploys from master; prod deploys are manual with the pinned CLI and the
  logged-in account, no `--token` (the `.env.local` token went limited; see
  commit `4d45755` and `docs/runbook.md`).
- Never run `pnpm` here. Use `./node_modules/.bin/*` directly.
- `docs/CONVENTIONS.md` is the standard. Every DB change ships with its
  `scripts/db-smoke.sql` expectations in the same commit.
- Verification bar per phase: `tsc --noEmit`, `next lint`, `vitest run`, the
  phase's own **Accept** checks, and the relevant e2e spec(s) via
  `scripts/run-e2e.sh`. Money phases also run `E2E_MONEY=1`.
- Each finding is cited as `NN-Pn` (report number, severity) so the report's
  **Where** block is the spec. Do not re-derive the failure path; read it there.
- Fix the finding as filed. If the report's fix direction turns out wrong on
  contact with the code, say so in the commit message and do the right thing.
  Do not widen scope into "while I'm here" refactors; that is what R10 is for.

---

## Rulings needed before or during the arc

Five findings are decisions, not bugs. Each has a default so the arc never
blocks; a ruling overrides the default. Record whichever applies in
`DECISIONS.md` in the phase that touches it.

| # | Question | Default if no ruling | Phase |
|---|---|---|---|
| D1 | Seller-protection requirement 3 ("carrier confirmed delivery") is met today by the artist clicking Mark Delivered (04-P2). Accept artist attestation at launch, or require buyer confirmation like pickup? | Accept attestation at launch, freeze the column, stamp it server-side, change the artist-facing wording to match. Revisit carrier lookup post-launch. | R3 |
| D2 | Pickup orders are taxed on the card's billing address, not the Houston handoff (04-P2). Counsel question. | Verify the mechanism in R0; leave tax sourcing as is and record the open question. | R0 |
| D3 | Every buyer's `full_name` and signup date are anon-readable through `profiles` (01-P2). Keep for identity display, or restrict to `authenticated`? | Keep `full_name` anon-readable (artist pages need it); drop `email_preferences` from the anon grant; restore own-row visibility on `follows`. | R8 |
| D4 | Primary buttons, terra links/prices, and success/warning toasts fail AA contrast (03-P2). Darken the text-use terracotta? | Add a `terraText` step (≈`#B5502E`) for text and links only; keep the brand terracotta for large type and non-text accents; restyle the two toasts dark-on-tint. | R9 |
| D5 | A disputed commission has no exit anywhere (04-P2). Add an admin resolve route and list? | Yes: `disputed → confirmed \| cancelled` with `closed_reason`, plus requester withdraw. | R10 |

---

## R0 — Baseline and the UNVERIFIED items (S)

**Why.** Four findings were filed UNVERIFIED with a stated test. Settling them
first decides their severity and whether R8 needs a CHECK constraint. The
reports and this plan also need to be in git before fixes start.

**Do.**
1. Commit `docs/reviews/*.md`, `docs/REVIEW-PROMPT.md`, and this plan.
2. On staging, trigger one admin password reset and read the `/reset-password`
   URL fragment. `access_token` in the fragment confirms 01-P1.
3. Set a test partner's `website_url` to `javascript:alert(document.cookie)`
   and click it in Chrome, Firefox, Safari (01-P2). Executes anywhere → P0.
4. Create one test-mode pickup checkout session with a non-Texas billing ZIP and
   read `total_details.amount_tax` (04-P2, D2). Record the result.
5. Hit the REST endpoint with a synthetic 250-id `in.()` filter and note
   whether it returns 414 (02-P2 unread counts). Informational only.
6. Write the outcomes at the top of the relevant reports as a dated
   "Verification" line.

**Accept.** Four dated verification lines exist; D2's observed tax amount is
recorded in `DECISIONS.md` as an open question or a decision.

---

## R1 — Money rows outlive the people in them (S) — 01-P0

**Why.** Self-service account deletion cascades `orders`, `reviews`,
`conversations`, and `commissions`. A later chargeback then finds no order,
and both dispute handlers `break` on `!order` and return 200.

**Do.**
1. `src/app/api/account/delete/route.ts`: refuse (409 with a plain message)
   while the account is party to any order in `paid`, `shipped`, `disputed`,
   or with `refund_approved_at` set, as buyer or artist. The account page
   shows the message and points to support.
2. Migration: `orders.buyer_id`, `orders.artist_id`, `reviews.reviewer_id`,
   `commissions.requester_id` → `ON DELETE SET NULL` (drop NOT NULL where
   needed). Leave `conversations` cascading; the order row is the record that
   matters. Update `src/types/order.ts` and the three status-badge readers to
   tolerate a null party.
3. Smoke test: assert the four FK actions.
4. e2e: extend the account-deletion spec with a user who has a paid order and
   assert the refusal (05-P3 tests item 7).

**Accept.** A buyer with a paid order cannot delete; a buyer with only
delivered orders can, and the order row survives with `buyer_id NULL` and its
Stripe ids intact. Both dispute webhooks still find the order by payment intent.

---

## R2 — Webhook dispute lifecycle (M) — 04-P1 ×2, 04-P2 ×2, 04 appendix, 05-P3 tests

**Why.** Every P1 in the money and code-health passes lives in
`src/app/api/webhooks/stripe/route.ts` `charge.dispute.*` and `charge.refunded`,
and those branches have zero tests. One PR, one file, one migration.

**Do.**
1. Migration: `orders.pre_dispute_status TEXT NULL` (frozen for non-privileged
   writers in `guard_orders_update`).
2. `charge.dispute.created`: if `dispute.status` starts with `warning_`, it is
   an inquiry: notify artist and admins with inquiry wording, record
   `dispute_id`, do **not** change status or assess protection. If
   `stripe_refund_id` is set or status is `refunded`, record the dispute id,
   notify admins, leave status alone. Otherwise set `pre_dispute_status` from
   the current status before writing `disputed`.
3. `charge.dispute.closed`: "not lost" is the restore branch (covers `won` and
   `warning_closed`). Restore to `pre_dispute_status` when set; fall back to
   `refunded` if a refund id exists, else `shipped` if `shipped_at` and not
   `delivered_at`, else the existing `delivered_at ? 'delivered' : 'paid'`.
   Notify the artist of the outcome in-app (appendix).
4. Lost branch: reverse `dispute.amount` (capped at the recorded payout), not
   the whole payout; fix the "payout reversed" log when the reversal was
   skipped.
5. `guard_orders_update`: stamp `shipped_at` only when it is null.
6. Every `orders`/`listings` status write in the webhook checks its result and
   returns 500 (Stripe retries) on failure; the redelivery short-circuit
   resumes the post-insert steps (listing `sold`, emails) when they did not
   happen. Relist on refund only if the listing is still `sold`, never from
   `hidden`.
7. Refund and dispute events whose payment intent matches no order return 409
   so Stripe retries after the order exists (oversell audit rows count as a
   match). Keep 200 for the oversell path itself.
8. Extract `artistRepliedInTime` (with its inputs as a message list) and a
   `selectDisputeCloseOutcome(order, dispute)` into `src/utils/`, and add
   `vitest` suites that pin: inquiry created/closed, won after refund, won
   in-transit, lost after refund, lost with partial amount.

**Accept.** Unit suites green. Manually replay (Stripe CLI `trigger` or fixture
POSTs with a valid signature) the five scenarios against staging and check
`orders.status` after each. `purchase-refund.spec.ts` green with `E2E_MONEY=1`.

---

## R3 — Order guard and seller protection (S) — 04-P2 guard, 04-P2 attestation, 05-P1

**Why.** The status guard checks the target state, not the transition, so
`refunded → delivered` re-occupies the one-live-order slot and auto-refunds
every future buyer. The reply-window check uses the wrong window and the wrong
thread lookup, so the platform absorbs losses the policy assigns to artists.

**Do.**
1. `guard_orders_update`: when not privileged, a status change is allowed only
   if `OLD.status IN ('paid','shipped')`. Freeze `delivered_at` for
   non-privileged writers.
2. Move the Mark Delivered write behind a small route that stamps
   `delivered_at` server-side after an ownership check (same shape as
   `notify-shipped`), and give `notify-shipped` a once-only stamp (01/04
   appendix).
3. Webhook `artistRepliedInTime` (now in `src/utils`): pass
   `REPLY_WINDOW_BUSINESS_DAYS`, find the thread by the two participants the
   way the pickup branch does, consider only messages after the order's
   `created_at`. `ProtectionBadge` keeps its optimistic `true` but says so in
   the copy.
4. D1: record the ruling in `DECISIONS.md`; change the artist-facing text in
   `evaluateProtection.ts` and `SELLER_PROTECTION_SPEC.md` to match.
5. Smoke test: the transition matrix (`refunded→delivered` denied,
   `paid→shipped` allowed, `delivered_at` frozen).

**Accept.** Smoke matrix green; the reply-window unit test from R2 pins 3
days; a two-listing pair with one shared thread evaluates requirement 6
correctly in a fixture test.

---

## R4 — Reconciliation cron (S) — 04-P2

**Why.** Nothing lists Stripe payments and diffs them against `orders`. After
R2 the webhook retries instead of dropping, but a retry window can still
expire.

**Do.**
1. `src/app/api/cron/stripe-reconcile/route.ts` (CRON_SECRET-gated, added to
   `vercel.json` daily): list succeeded payment intents from the last 7 days;
   for each, require an `orders` row or an oversell audit row; compare Stripe
   `refunded`/`disputed` state against the row's status. Any mismatch →
   one admin notification (batch insert) and a Sentry message.
2. Read-only. It never writes to `orders`.

**Accept.** Run it against staging after a manual dashboard refund with the
webhook secret deliberately wrong; the mismatch is reported.

**Tier 1 gate.** After R1–R4 merge and deploy, re-run review passes 4 and 1
(see R12) before Stripe live activation. A clean money pass is the go signal.

---

## R5 — Failures become visible (M) — 05-P2 email, 03-P2 ×4, 05-P2 connect, 02-P2 polling

**Why.** Email failures, fetch failures, and the two hand-rolled fetches are
structurally silent. Discovery today is a tester saying "I never got an
email".

**Do.**
1. `src/services/email.ts`: every `emails.send` reads `{ error }` and
   `Sentry.captureMessage` with the template name (mirror `sendBulkEmails`).
   Every `.catch(() => {})` at the call sites becomes
   `.catch(captureException)` as `api/messages/route.ts` already does.
   `src/lib/resend.ts` throws at boot if the key is missing, same as
   `EMAIL_FROM`.
2. Error states with a retry (`refetch`) on: `SalesSection`, `(user)/orders`,
   `following`, `saved`, `ListingsSection`, `SeriesSection`,
   `PartnerPicksManager`, `studio/services`, `GalleryDashboard`,
   `CommissionPanel` (stop coercing to null).
3. `SetupChecklist.submit`: try/catch/finally; read the user from `useAuth()`.
4. `PayoutsSection`: toast the route's error and `captureException`; the
   `stripe-connect` route wraps its Stripe calls, returns 502 with a plain
   message, asserts the row write, and on a failed write deletes the
   just-created account. Pass an idempotency key derived from the artist id
   (04-P3).
5. `(user)/orders` with `?success=true`: poll `['orders','buyer',id]` every
   3 s for up to 60 s until an order newer than the redirect appears.
6. Create Listing: wrap `onSubmit` in try/catch that toasts; keep the created
   listing id in state so a retry patches images onto it. Edit Listing: same
   wrap, plus redirect to a not-found state when the query errors or
   `listing.artist_id !== artistId`.
7. `admin/page.tsx`: check `res.ok` before reading stats (05 appendix).
   `Navbar` sign-out: catch and toast (01/03 appendix).

**Accept.** With `RESEND_API_KEY` set to garbage on staging, a checkout
produces a Sentry event naming the template. Each surface in item 2 shows its
error state when the network is offline in devtools. A double-tap on Publish
creates one listing.

---

## R6 — Reviews reach the artist; small notification holes (S) — 05-P2, 05-P3 items 2 and 8

**Do.**
1. `useCreateReview` calls `POST /api/reviews` (the `listingApi` helper
   pattern); delete `services/reviews.createReview`. Add a `review_received`
   notification insert to the route.
2. `EMAILABLE.add('file')` in `api/messages/route.ts`; add `file` to
   `MessageType`.
3. `ShippingAddress.name` in `src/types/order.ts`; render it in
   `SalesSection`'s address block.
4. `(user)/orders`: render the listing title and artist name the page already
   fetches (03 appendix).

**Accept.** `purchase-refund.spec.ts` "buyer reviews" step now also asserts
the artist's notification row. A PDF sent as the first message triggers the
new-message email in the e2e mail check (or a manual send on staging).

---

## R7 — The physical data layer (M) — 02-P2 ×9, 01-P2 analytics

**Why.** 48 migrations, four non-unique indexes, none on the foreign keys the
hot paths filter by. 02's coverage table is the spec.

**Do.**
1. One migration with every bold row in 02's table: `listing_images
   (listing_id, display_order)`, `listings (status, created_at DESC)`,
   `listings (artist_id, created_at DESC)`, `orders (buyer_id, created_at
   DESC)`, `orders (artist_id, created_at DESC)`, `conversations
   (participant_one)`, `conversations (participant_two)`, `commissions
   (conversation_id)`, `commissions (artist_id)`, `commissions
   (requester_id)`, `follows (artist_id)`, `saved_listings (listing_id)`,
   partial `messages (conversation_id) WHERE NOT is_read`, partial
   `analytics_events (viewer_id, created_at DESC) WHERE event_type =
   'listing_view' AND listing_id IS NOT NULL`.
2. Delete `GET /api/listings` and `GET /api/artists` and their middleware
   entries.
3. `analytics_events`: drop the anon INSERT policy; `TrackView` posts to
   `/api/analytics` (already throttled), which inserts with the service role.
4. RPCs, each `SECURITY INVOKER` under the caller's RLS:
   `neighborhood_listing_counts(city)`, `my_unread_counts()`,
   `artist_sales_totals(artist_id)` (sum payout, count by status). Point
   `featured.ts`, `useUnreadCounts`, `PayoutsSection`/`studio/page` at them.
5. One `['saved-ids', profileId]` query returning a `Set`; `FeedCard` derives
   `isSaved` from it; the toggle updates that key only. Same for followed ids.
6. `sitemap.ts`: `.order('created_at')` and `generateSitemaps` with
   `.range()` pages. Feed select: explicit column list without
   `search_vector` and `description`.
7. `EXPLAIN (ANALYZE, BUFFERS)` the feed page-10 query and the Studio orders
   query on staging before and after; paste both plans in the PR.

**Accept.** Both plans show index scans; the homepage for a signed-in user
issues no `analytics_events` scan and no per-card `saved_listings` requests;
`db-smoke.sql` lists the new indexes.

**Deferred, by trigger.** The unfiltered `messages` Realtime subscription
(02-P2) stays until concurrent signed-in users approach the hundreds. If
badges lag first, switch `UnreadContext` to the 30 s poll it already has. The
recipient-column redesign belongs in `GO-LIVE-PLAN.md` Tier 2.

---

## R8 — Access and auth migration (S) — 01-P1, 01-P2 ×3, 01-P3

**Do.**
1. `guard_profiles_update`: freeze `email` and `unsubscribe_token` for
   non-privileged callers. Add the UPDATE grant matrix to `db-smoke.sql` so a
   new column fails closed.
2. `follows`: drop `USING (true)`; restore the own-row SELECT policy; add
   `follower_count(artist_id)` `SECURITY DEFINER`; `getFollowerCount` uses it.
   Drop `email_preferences` from the anon grant on `profiles` (D3).
3. `is_privileged()`: detect the service role explicitly
   (`auth.role() = 'service_role'`) instead of `auth.uid() IS NULL`; smoke
   assertion that it is false under `anon`.
4. `CHECK (website_url ~ '^https?://')` on `gallery_profiles` and
   `artist_profiles` (nullable); `GalleryHero` renders no anchor otherwise.
   Add a baseline CSP header in `next.config.mjs` if R0 step 3 executed
   anywhere.
5. Admin reset-password: email a link to `/auth/reset-callback?token_hash=…`
   that calls `verifyOtp({ type: 'recovery' })` with the cookie server client
   and redirects to `/reset-password`. `reset-password/page.tsx` shows a
   "link expired" state when it arrives without a recovery session.
6. Appendix items in the same PR: `verification_requests` INSERT pins
   `status = 'pending'`; `reports` INSERT pins `status`, null
   `admin_notes`/`resolved_by`; remove the dead `/api/reports` limit entry.

**Accept.** Smoke: `PATCH profiles.email` as owner denied; anon `follows`
select returns own rows only; `is_privileged()` false under anon; the admin
reset link lands the user signed in on `/reset-password` on staging.

---

## R9 — Frontend (M) — 03-P1, 03-P2 ×6, 03-P3

**Do.**
1. `Modal`: `role="dialog"`, `aria-modal`, `aria-labelledby` on the title,
   `aria-label` on close, move focus to the first focusable child on open,
   wrap Tab/Shift+Tab, restore focus to the opener on close, Escape closes.
   Route `FilterDrawer` and both lightboxes through it (the commission one
   gets a close button).
2. `Textarea` and `Select` primitives with `useId` wiring like `Input`;
   replace the seventeen unlabeled instances.
3. Requester Decline and Cancel Request go through `useConfirm()` with
   `destructive: true`, in the rail and the chat bubble.
4. `FilterDrawer` renders the full filter set (neighborhood, school,
   availability, commissions-open) plus Clear; pass `useFilterOptions` down or
   make one responsive component.
5. Year Created on Edit Listing; label on the status select; unify the price
   field's empty-value handling between the two pages.
6. `ArtistProfileEdit`: `error=` on every registered input, inline messages
   under textareas, scroll and focus the first errored control on invalid
   submit. Error toasts persist until dismissed.
7. D4: palette step for text terracotta; toasts and success Badge restyled;
   re-run the contrast table in 03 and paste it in the PR.
8. Quick ones from the appendix: `following`/`GalleryDashboard`/`ProfileCard`
   use the avatar not the banner; account password fields inside a `<form>`
   with `autocomplete="new-password"`; `SetupChecklist` done-state readable
   by screen readers; `aria-expanded` and Escape on the three menus.

**Accept.** Keyboard-only walk on staging: open and close Ship Order, a
confirm dialog, the filter drawer, and both lightboxes without a mouse; a
`visitor.spec.ts` run under the Playwright `mobile` project passes with the
drawer showing all filters. `axe` (Playwright plugin) reports no dialog-name
or label violations on Studio, the listing page, and the profile editor.

---

## R10 — Code health batch (M) — 05-P3 ×5, 04-P2 commission, 02-P3, 01/04 appendix

**Do.**
1. Dead code, one commit: `api/conversations` POST, `api/conversations/[id]/
   messages` GET+POST, the ten hooks, the twelve service functions,
   `sendMessageSchema`/`createConversationSchema`, `usePresence`,
   `PresenceIndicator`, the four `search/*` components, `ProfileBio`, the
   empty Videos fieldset.
2. `await` the five floating `refresh_completeness_score` calls; enable
   `@typescript-eslint/no-floating-promises` (checksVoidReturn off) and fix
   what it flags.
3. Route the six Studio-side own-artist-row lookups through
   `useOwnArtistProfile` (extend its columns once); delete the effects.
4. Type and schema drift list from 05-P3: `message_type` enums,
   `graduation_year` max → current year + 6, `year_created` max as a
   `refine`, `Report.listing_id` nullable, `Profile.email` optional, the
   four artist non-nulls, `listingWriteSchema` vs `createListing`'s type.
5. `onError` on `useCreateReport` (toast) and `useMarkAsRead`
   (`captureException`).
6. D5: `POST /api/admin/commissions/[id]/resolve` and a requester withdraw
   route; an admin commissions list page; `dispute` route stops overwriting
   `artist_notes` (new `dispute_reason` column); `updates` route refuses
   closed statuses; `confirm`/`decline` return 409 on a lost CAS.
7. `listings/[id]` DELETE returns 409 with a message when an order exists;
   admin verifications route does a compare-and-swap on `status` and links
   to `/studio`; `SeriesSection` delete gets a loading state; conversations
   `NULLS LAST` on `last_message_at`.

**Accept.** `tsc`, lint (with the new rule), vitest green; grep for each
deleted identifier returns nothing; the Studio completeness card matches the
editor's local bar after an avatar upload.

---

## R11 — Tests that would have caught this round (S) — 05-P3 tests

**Do.**
1. Unit: `safePath` (open-redirect variants), `dimensions` round-trip at the
   stored precision, "TS completeness score equals SQL score" fixture, admin
   refund tax proration examples from `DECISIONS.md`.
2. Nightly: `E2E_MONEY=1` in `scripts/nightly-e2e.sh`; add
   `--project=mobile` for `visitor.spec.ts`; add `critical-paths` to the
   run list.
3. e2e: two-sided pickup handoff, `/unsubscribe`, and the account-delete
   refusal from R1.

**Accept.** Nightly runs green twice in a row with the new specs included.

---

## R12 — Re-review (S)

**Do.** After the Tier 1 gate (post-R4) and again after R11, re-run passes 4
and 1 from `docs/reviews/prompts/` as fresh Fable 5.1 sessions, headless:

```
BIN=~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude
cd ~/Projects/custom-canvas
nohup $BIN -p --model claude-fable-5-1 --dangerously-skip-permissions \
  --output-format text "$(cat docs/reviews/prompts/pass-4-money.txt)" \
  < /dev/null > /tmp/pass-4.log 2>&1 &
```

Each pass takes 11–15 minutes. Edit the prompt's report path first so the
new report lands as `docs/reviews/04-money-r2.md` rather than overwriting.
Triage the new report against this plan; anything new goes in a dated
addendum below.

**Accept.** The re-run money pass has no P0 or P1. That is the Stripe
activation go signal from this arc's side; `GO-LIVE-PLAN.md` owns the rest.

---

## Traceability

Every P0–P2 finding maps to a phase. P3 and appendix items are in R10 unless
listed elsewhere above. "Deferred" items have a trigger, not a date.

| Report | Finding | Phase |
|---|---|---|
| 01 | P0 account delete cascade | R1 |
| 01 | P1 admin reset link | R0 verify, R8 |
| 01 | P2 `profiles.email` writable | R8 |
| 01 | P2 follow graph / directory | R8 (D3) |
| 01 | P2 anon analytics inserts | R7 |
| 01 | P2 `website_url` href | R0 verify, R8 |
| 01 | P3 `is_privileged()` | R8 |
| 02 | P2 `listing_images` index and the coverage table | R7 |
| 02 | P2 recently viewed scan | R7 |
| 02 | P2 unfiltered Realtime | Deferred (trigger: hundreds concurrent) |
| 02 | P2 saved-status N+1 | R7 |
| 02 | P2 totals / sitemap cap | R7 |
| 02 | P2 unread counts URL | R7 |
| 02 | P2 neighborhood spotlight | R7 |
| 02 | P2 orders page race | R5 |
| 02 | P2 unused public GETs | R7 |
| 02 | P3 onError ×2 | R10 |
| 03 | P1 dialog focus | R9 |
| 03 | P2 double-create | R5 |
| 03 | P2 seven empty-on-error surfaces | R5 |
| 03 | P2 submit for review | R5 |
| 03 | P2 edit listing not-found/owner | R5 |
| 03 | P2 mobile drawer | R9 |
| 03 | P2 contrast | R9 (D4) |
| 03 | P2 masonry reflow | Deferred (needs image dimensions at upload; after launch) |
| 03 | P2 decline confirm | R9 |
| 03 | P2 profile inline errors | R9 |
| 03 | P2 Year Created | R9 |
| 03 | P3 labels | R9 |
| 04 | P1 inquiry dispute stuck | R2 |
| 04 | P1 chargeback after refund | R2 |
| 04 | P2 delivery self-attestation | R3 (D1) |
| 04 | P2 orphan events / no reconciliation | R2, R4 |
| 04 | P2 guard transition | R3 |
| 04 | P2 pickup tax | R0 (D2) |
| 04 | P2 won dispute regresses shipped | R2 |
| 04 | P2 disputed commission | R10 (D5) |
| 04 | P3 Connect orphan account | R5 |
| 05 | P1 reply window | R3 |
| 05 | P2 email errors discarded | R5 |
| 05 | P2 reviews never notify | R6 |
| 05 | P2 Connect fails silently | R5 |
| 05 | P3 floating rpc | R10 |
| 05 | P3 seven lookups | R10 |
| 05 | P3 dead code | R10 |
| 05 | P3 type drift (items 2, 8 → R6) | R10 |
| 05 | P3 onError ×2 | R10 |
| 05 | P3 tests | R2, R11 |

**Sizing.** S = a session or less; M = one to two sessions. Tier 1 is four
S/M phases and one gate. The whole arc is roughly a dozen sessions plus two
re-review runs.

---

## Addenda

*(dated notes from the implementing sessions: rulings received, findings that
did not survive contact with the code, new items from R12)*

### 2026-09-02 — execution notes (R0–R11 merged the same day)

**Rulings.** No rulings arrived during the arc, so every default applied: D1
(artist attestation accepted, `delivered_at` now server-stamped and frozen),
D2 (billing-address sourcing kept, open counsel question), D3 (`full_name`
stays anon-readable, `email_preferences` grant dropped, follows own-row),
D4 (`terraText` `#A84928` for text; `#B5502E` failed on `terraSoft`/`sand`),
D5 (admin resolve + requester withdraw routes, `/admin/commissions`).

**Deviations that changed the plan on contact with the code.**
- R1 also set `orders.listing_id` and `orders.commission_id` to
  `ON DELETE SET NULL`: an artist's listings cascade away with their profile,
  so a surviving order would otherwise block `deleteUser` on the FK.
- R2 also handles `charge.dispute.updated`: an inquiry that escalates keeps
  its dispute id and never fires `created` again. **The Stripe endpoint must
  be subscribed to that event** (dashboard, both test and live).
- R2 reuses the `order_disputed` notification type for the artist's outcome
  message; no new CHECK value.
- R3 narrowed the non-privileged transition to `paid|shipped → shipped` only;
  `delivered` is reached solely through `/api/orders/[id]/mark-delivered`.
- R4 could not expand `latest_charge.dispute` under the pinned Stripe API
  version; the cron lists disputes per disputed charge instead. Its admin
  alert reuses the `refund_approved` type.
- R5 does **not** delete a freshly created Stripe Connect account when the
  row write fails: with the idempotency key, the retry adopts the same
  account, which is the outcome the finding wanted. The email wrapper
  returns a boolean and reports once to Sentry rather than throwing.
- R7's analytics policy drop moved to R8 so policy-changing migrations
  landed after Tier 1. R7 grants the read RPCs explicitly (Supabase's default
  gave `anon` EXECUTE). `/sitemap.xml` is now an index route over
  `/sitemap/N.xml`; the sitemap uses a cookie-free anon client because
  `generateSitemaps` runs at build time (found by R10's `next build`).
- R8 made `profiles` UPDATE column-level (`full_name, avatar_url,
  email_preferences`) in addition to the guard freeze. `is_privileged()`
  treats "no JWT claims at all" as privileged so GoTrue's cascade updates and
  psql keep working; only `anon`/`authenticated` claims are unprivileged.
  No CSP was added (R0 showed the `javascript:` href is inert in Chromium and
  WebKit; a real CSP needs nonces through middleware).
- R9 darkened the primary button background, not only its label: no label
  colour passes on both `terra` and `terraDark`.
- R10: `no-floating-promises` needs `checkThenables: true` to see a
  PostgrestBuilder; plain configuration would have caught none of the five.
  `ArtistSetupGuard` now redirects only on a settled, error-free empty read.
- R11 found the TS/SQL completeness score disagreeing on empty-string image
  URLs; fixed in migration 00054 (SQL now length/trim-checks both columns).

**Verification notes.** The Tier 1 e2e run against staging failed 9 of 11
specs on the shared login helper while four implementing agents were also
signing in against DEV (the auth throttling `e2e/README.md` documents); the
post-merge run is the one that counts. Firefox was not tested for the
`javascript:` href (Playwright has no Firefox binary here).

**Left for follow-up (not in scope of any phase).**
- `ImageCarousel`'s lightbox still does not move focus (the one dialog
  outside `Modal`).
- `muted` on `sand` is 4.41:1, pre-existing and outside D4.
- The `pickup-handoff` and `unsubscribe` e2e specs have never run in a
  browser; run them solo against staging before trusting the nightly.
- The `purchase-refund` "buyer reviews" step does not yet assert the artist's
  `review_received` notification row.
- `reviews.artist_id` still cascades on artist deletion (the order survives;
  the review does not).
- A lost dispute after a dashboard-initiated refund that already reversed
  the transfer will hit a Stripe error on the second reversal and 500 (Stripe
  retries); the reconcile cron will report it. Rare; not handled.

### 2026-09-02 (late) — R12 re-reviews and the fix rounds they triggered

R12 ran the money pass three times and the auth pass twice; each pass was a
fresh session reading the merged code. Every pass found less, and the last
money pass is the gate.

- **Money pass 2** (`04-money-r2.md`): 1 P1, 4 P2, 3 P3 — all in the dispute
  handlers' assumption that `created` runs once, before `closed`, and the
  reconcile window keyed on payment date. **R13** fixed all of it: assess
  before reversing when `protection_status` is still `pending`; closed
  statuses never re-freeze; refund evidence outranks `pre_dispute_status`;
  restore is compare-and-swapped; the cron also sweeps refunds, disputes and
  every `disputed` row by event time; `disputed` holds the one-live-order
  slot (00055).
- **Money pass 3** (`04-money-r3.md`): 1 P1, 2 P2, 3 P3 — the single
  `dispute_id`/`dispute_outcome` slot. **R15** added `orders.dispute_status`
  (00057) so an inquiry that escalates after a platform refund is notified,
  a second dispute on the same payment reverses the remainder, resent open
  events are recognised by outcome, listings with a live order cannot go
  back on sale, oversold buyers are told, `shipping_address` is frozen and
  `tracking_number`/`carrier` freeze after delivery, and `delivered_at` is
  never re-stamped.
- **Auth pass 2** (`01-auth-access-r2.md`): 3 P2, 1 P3. **R14** (00056)
  dropped the unconditional SELECT policies on the five public buckets
  (anonymous listing verified before and after), records a payment whose
  buyer/listing/artist was deleted mid-Checkout with null parties instead of
  retrying forever, guards `messages`/`message_attachments` inserts against
  platform-only types and stamps quote cards from the row, guards
  `commissions` inserts, and made the admin reset link a POST confirmation
  so mail scanners cannot consume it.
- **e2e fallout fixed on master:** hearts and follow buttons wait for the
  shared id set (a click before it loaded posted a duplicate save); saves
  and follows retry once on an RLS refusal near signup (rule 3); error toasts
  moved bottom-right because a persistent one covered the account menu;
  three spec selectors updated for R9's confirm dialog, badge name and
  palette class.

**Follow-ups added by these passes (not taken):** the r3 appendix items not
in files R15 touched; the r2 auth appendix lines on `register` copy under
autoconfirm and `profiles.role` not being the artist authorization
primitive; an `order_disputes` table if disputes ever need per-dispute
exactness; the partially-reversed-transfer edge on a lost dispute.
