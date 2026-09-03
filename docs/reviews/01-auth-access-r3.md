# Accounts, auth & access control — review 2026-09-03

**Files read:**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`, `docs/reviews/01-auth-access.md` and
`01-auth-access-r2.md` (headings only, to avoid re-reporting).
Scope: `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`,
`src/services/acceptance.ts`, `src/components/legal/AcceptanceInterstitial.tsx`,
`src/app/api/payments/checkout/route.ts`, `src/app/api/listings/route.ts`,
`src/app/api/listings/[id]/route.ts`, `src/app/api/messages/route.ts`,
`src/app/api/reviews/route.ts`, `src/app/api/commissions/route.ts` and all seven
`src/app/api/commissions/[id]/*/route.ts`, `src/app/api/orders/[id]/{return-shipped,
cancel-unshipped,propose-ship-by,accept-ship-by,concede-dispute,approve-refund}/route.ts`,
`src/app/api/admin/orders/[id]/{signature-confirmed,return}/route.ts`,
`src/app/api/admin/dmca/route.ts`, `src/app/admin/dmca/page.tsx`,
`src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`, `src/hooks/useFeed.ts`,
`src/services/{feed,featured,partnerPicks,listings}.ts`, `src/hooks/useOrderReturn.ts`,
`src/lib/orderReturns.ts`, `supabase/migrations/00058`, `00063`, `00064`, `00065`,
`scripts/db-smoke.sql` §10–14.
Read as callers/context (not scope, but required to confirm or kill findings):
`src/lib/{supabase-admin,supabase-server,assessProtection,settleRefund}.ts`,
`src/utils/{evaluateProtection,fulfillmentWindow}.ts`, `src/components/studio/ProtectionBadge.tsx`,
`src/context/AuthContext.tsx`, `src/app/(auth)/onboarding/artist/page.tsx`,
`src/app/api/artist/submit/route.ts`, and migrations `00001`, `00012`, `00018`, `00023`,
`00030`, `00032`, `00033`, `00037`, `00038`, `00052`, `00056`.
Nothing in scope was skipped.

**Verdict:** The acceptance record on `profiles` is genuinely server-owned and tamper-proof, the
seven new order routes are clean on ownership and CAS, and `order_returns` RLS does exactly what
it claims. But migration 00063 silently reverted the 00023 signup-role sanitiser — self-registration
as `admin` works again — and the other half of the acceptance record (`artist_profiles.agreement_*`)
is still written by the browser at INSERT, so an artist can stamp and backdate their own acceptance
of the Artist Agreement.

---

### P0 — Migration 00063 reverted the signup role sanitiser: anyone can self-register as `admin`

**Where:** `supabase/migrations/00063_stamp_terms_at_signup.sql:40-58` (line 47), reverting
`supabase/migrations/00023_signup_role_sanitize.sql:7-18`

**What happens:** `handle_new_user` inserts
`COALESCE(NEW.raw_user_meta_data->>'role', 'user')` into `profiles.role`. The signup metadata is
entirely client-controlled — `AuthContext.signUp` already passes `options.data.role`
(`src/context/AuthContext.tsx:106-113`). So anyone with the public anon key runs
`supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })`, confirms the mail
in their own inbox, and holds an account whose `profiles.role = 'admin'`. `profiles.role`'s CHECK
allows `'admin'`, and there is no INSERT guard on `profiles` (only `guard_artist_profiles_insert`
exists) to stop it. From there `is_privileged()` returns true, so every column freeze in the
codebase — acceptance columns, `dmca_removed_at`, order money columns, `stripe_account_id` — is
bypassed, every "Admins can see all X" policy opens, and every admin route passes, because they all
check exactly this column (`requireAdmin` in `src/app/api/admin/dmca/route.ts:42-51`,
`src/app/api/admin/orders/[id]/return/route.ts:57-58`). The DMCA log, every buyer's shipping
address, every return address and the refund controls are all one signup away.

**Why it's real:** 00023 exists solely to fix this — its header names the exact exploit — and its
body sanitises with `safe_role := CASE WHEN requested IN ('artist','gallery') THEN requested ELSE
'user' END`. 00063 is a later `CREATE OR REPLACE` of the same function whose body was rebuilt from
the pre-00023 shape (it even restores 00001's `COALESCE` verbatim) and it never mentions the role.
No migration after 00063 redefines the function; 00052 only mentions `handle_new_user` in a comment.
The innocent explanation I looked for — a `BEFORE INSERT` trigger or CHECK on `profiles` catching
`'admin'` — does not exist; the trigger is SECURITY DEFINER and `role TEXT NOT NULL CHECK (role IN
('artist','user','gallery','admin'))` (00001:16) admits it. db-smoke has no assertion for this: §12
inserts `raw_user_meta_data` with no `role` key, so it passes either way. Prod is running the 00063
body — §12's terms-stamp assertion would fail against the 00023 body, and the 00063 hotfix commit
records it being applied.

**Fix direction:** Reinstate 00023's `safe_role` CASE inside 00063's body in a new migration, keeping
the schema qualification and the terms stamp. Add a db-smoke assertion under §12 that inserts an
`auth.users` row with `{"role":"admin"}` metadata and fails unless the profile lands as `'user'` —
that is the pin whose absence let this regress twice.

---

### P1 — An artist stamps and backdates their own Artist Agreement acceptance at INSERT, and that clears the acceptance gate

**Where:** `src/app/(auth)/onboarding/artist/page.tsx:113-124`;
`supabase/migrations/00032_application_submit.sql:23-38` (the INSERT guard that omits them);
`supabase/migrations/00037_artist_agreement.sql:14-33` (the UPDATE freeze)

**What happens:** `agreement_accepted_at` and `agreement_version` are supplied by the browser in the
`artist_profiles` INSERT. RLS allows any authenticated account to insert its own row
(`auth.uid() = profile_id`, 00001:106), `artist_profiles` keeps table-level INSERT/UPDATE grants
(db-smoke §3 says so explicitly), and `guard_artist_profiles_insert` forces `is_live`,
`application_status`, `reviewed_*`, `is_houston_verified` and `is_featured` but says nothing about
the agreement columns. So one PostgREST call —
`POST /rest/v1/artist_profiles {profile_id: <self>, slug, display_name, agreement_version: "2.0",
agreement_accepted_at: "2019-01-01"}` — records acceptance of an agreement that was never rendered,
at a date of the account's choosing. Three things then follow: `outstandingAcceptances`
(`src/lib/acceptance.ts:99-109`) compares that value to `ARTIST_AGREEMENT_VERSION`, finds it equal,
and returns nothing outstanding, so `acceptanceGate` passes for every gated write; the submit-for-
review re-verification (`src/app/api/artist/submit/route.ts:29`) checks the same client-written
value and passes; and the 00037 UPDATE freeze then makes the forged stamp permanent for everyone but
the service role, so the false record is the one that survives.

**Why it's real:** I looked for the stamp being rewritten server-side after onboarding and it is
not — the only other writer of these columns is `POST /api/account/acceptance` (`route.ts:50-53`),
which never fires for an artist whose `agreement_version` already equals the constant. I checked the
grant matrix in case the columns were INSERT-restricted the way `profiles` columns are: db-smoke §3
records that "artist_profiles keeps its table-level UPDATE… so every column shows up here", and
there is no column-level INSERT grant anywhere in the migrations. db-smoke §10 pins the freeze on
`profiles.terms_*` and has no counterpart for these two. This is the same class of defect 00058
refuses to commit ("recording an acceptance that never happened is the one thing this record exists
to prevent") and that D11 rules out ("stamped server-side from the constants… never from anything
the client sends") — the Terms of Service half honours it, the Artist Agreement half does not.
Not P0 only because nothing crosses a user boundary: the forger can bind or unbind themselves, but
cannot touch anyone else's row or move money.

**Fix direction:** Add the two columns to `guard_artist_profiles_insert`'s non-privileged branch
(`NEW.agreement_accepted_at := NULL; NEW.agreement_version := NULL;`) and have onboarding call
`POST /api/account/acceptance` with `{"documents":["artist_agreement"]}` right after the insert, so
the version and the timestamp both come from the server. Extend db-smoke §10 to assert an
authenticated INSERT cannot set either column.

---

### P1 — A DMCA-removed listing can be deleted by the artist, taking the notice's evidence with it

**Where:** `supabase/migrations/00065_dmca_notices.sql:76-97` (guard covers UPDATE only);
`supabase/migrations/00001_initial_schema.sql:187-188` (DELETE policy);
`src/app/api/listings/[id]/route.ts:135-162`

**What happens:** `guard_listings_update` freezes `dmca_removed_at` and refuses a status change while
it is set, but it is a `BEFORE UPDATE` trigger and there is no DELETE guard. "Artists can delete own
listings" checks ownership and nothing else, and the DELETE route re-checks ownership and nothing
else. An artist whose listing was removed on a copyright notice opens Studio, deletes it, and the row
is gone; `dmca_notices.listing_id` is `ON DELETE SET NULL` (00065:24), so the notice detaches. The
admin queue then shows a notice with no listing, `restore` skips the listing update entirely and
still marks the notice `restored` (`src/app/api/admin/dmca/route.ts:165-175`) — silently recording a
restoration that restored nothing — and a follow-up `remove_material` on the same subject 409s with
"This notice is not attached to a listing". The artist re-uploads the same images as a fresh listing
the same afternoon, which is the outcome the stamp exists to prevent, and the record of what was
removed is gone from the file the safe harbour rests on.

**Why it's real:** I checked whether the FK would block the delete: `orders.listing_id` blocks a
*sold* piece (the route handles 23503 at line 152), but a DMCA'd listing with no order deletes
cleanly, and `dmca_notices.listing_id` is deliberately SET NULL rather than RESTRICT. I checked
db-smoke §13, which pins the status change and the stamp-clearing but never attempts a DELETE. The
repeat-infringer count survives (it keys on `subject_profile_id`), which is the one thing that does
not break — but the count is not the removal.

**Fix direction:** Add `AND dmca_removed_at IS NULL` to the artists' DELETE policy, or a
`BEFORE DELETE` guard raising the same message the update guard raises, and pin it in db-smoke §13.
Consider `ON DELETE RESTRICT` for `dmca_notices.listing_id` so the record cannot be orphaned even by
a privileged delete.

---

### P1 — `accept-ship-by` widens the seller-protection window, which it explicitly promises not to do

**Where:** `src/app/api/orders/[id]/accept-ship-by/route.ts:42-57`; consumed at
`src/lib/assessProtection.ts:90` and `src/components/studio/ProtectionBadge.tsx:58`

**What happens:** The route writes the agreed date into `orders.fulfillment_window_days`. That column
is not a display field — `assessProtection` reads it straight into `ProtectionInput.fulfillmentWindowDays`,
and requirement 1 in `evaluateProtection` is `businessDaysBetween(createdAt, shippedAt) >
fulfillmentWindowDays` (`src/utils/evaluateProtection.ts:155-161`). So: an artist misses the
5-business-day window, proposes a date 30 days out, the buyer accepts, the column becomes 30, the
artist ships on day 25, a non-receipt chargeback lands, and `assessProtection` now returns
`protected` on an order that was `ineligible` — the platform absorbs the chargeback it had decided
the artist would carry. The route's own doc comment says "It deliberately does NOT move the
seller-protection window: requirement 1 is measured against the original 5 business days, and the
artist's badge says so", and `src/utils/fulfillmentWindow.ts:24-26` repeats it. The badge shown to
the artist reads from the same widened value, so it tells them the same untrue thing.

**Why it's real:** I looked for a separate frozen copy of the original window — a
`protection_window_days`, a checkout snapshot, anything `assessProtection` could prefer — and there
is none; checkout writes `DEFAULT_FULFILLMENT_WINDOW_DAYS` into this one column
(`checkout/route.ts:192`) and this route overwrites it. I also checked whether the dispute freeze
saves it: `protection_status` is frozen at dispute time, but `signature-confirmed` re-assesses
afterwards through the same `assessProtection`, so the widened value is live on that path too.

**Fix direction:** Snapshot the protection window in its own column at checkout (or persist
`original_fulfillment_window_days` the first time this route widens it) and have `assessProtection`
and `ProtectionBadge` read that, leaving `fulfillment_window_days` as the buyer-facing promise the
cron and the cancel route use.

---

### P1 — DMCA `restore` forces `status = 'available'`, which can put a sold piece back on sale

**Where:** `src/app/api/admin/dmca/route.ts:165-174`; `remove_material` at `:134-139`

**What happens:** `remove_material` sets `status: 'hidden'` without recording what the status was,
and `restore` sets `status: 'available'` unconditionally. A notice against a piece that is `sold`
(the image is still on the site after the sale, which is exactly when a claimant finds it), or
`commission_only`, or hidden by the artist's own choice, is removed and later restored — and comes
back listed for sale. Checkout only checks `listing.status !== 'available'`
(`checkout/route.ts:54-56`), so the next buyer can pay for a painting that shipped weeks ago; the
webhook's order insert then hits `orders_one_live_per_listing`, takes the 23505 branch and
auto-refunds them (`webhooks/stripe/route.ts:365-410`) — the platform eating the processing fees on
a sale that could never exist. That is the same failure the listing PATCH route already guards
against, in the comment at `src/app/api/listings/[id]/route.ts:62-68`.

**Why it's real:** The PATCH route's live-order check is the proof that this state is known-bad and
guarded elsewhere; the DMCA route writes through `createAdminSupabaseClient()` and bypasses both
that check and `guard_listings_update` (which only constrains non-privileged writers). The codebase
already has the pattern for the missing piece — `pre_dispute_status` on orders (00053), persisted
precisely so a restore does not have to guess.

**Fix direction:** Record the prior status on the notice (or a `pre_dmca_status` column on the
listing) at `remove_material` and restore to it; failing that, restore to `hidden` and let the artist
republish, which the cleared stamp now allows. Either way, run the same live-order check the PATCH
route runs before moving a listing to `available`.

---

### P2 — `acceptanceGate` fails OPEN on an ordinary query error, not closed

**Where:** `src/lib/acceptance.ts:85-115` and `:136-152`

**What happens:** `outstandingAcceptances` destructures `const { data: profile } = await admin...`
and discards `error`. supabase-js does not throw on a query failure — it returns
`{ data: null, error }`. So a PostgREST 5xx, a saturated pooler, a schema-cache miss or a rotated /
mis-set `SUPABASE_SERVICE_ROLE_KEY` (PostgREST answers 401, the client returns an error object)
leaves `profile` null, `outstandingAcceptances` returns `[]`, `acceptanceBlocks([])` is false, and
`acceptanceGate` returns null — every gated write proceeds. The same swallow applies to the
`artist_profiles` lookup, so an error there silently treats the Artist Agreement as accepted. The
doc comment directly above says "Fails CLOSED: if the lookup itself throws, the write is refused",
which is true only of an exception; the ordinary failure mode is not one. With a bad service key the
system is at its most permissive exactly when it is most broken: the POST that records acceptance
returns 500 while the gate that enforces it lets everyone through.

**Why it's real:** I checked for `throwOnError()` or a global error handler on the admin client —
`src/lib/supabase-admin.ts` is a bare `createClient` with no such option. I also confirmed the
distinction matters: `createAdminSupabaseClient()` itself throws only when the env vars are missing
entirely, which is the one case the current code does handle.

**Fix direction:** Capture `error` from both queries in `outstandingAcceptances` and throw, letting
`acceptanceGate` catch and return the 403 (and `GET /api/account/acceptance` keep its deliberate
fail-open in its own `catch`). A missing profile row should also be treated as "cannot verify"
rather than "nothing outstanding".

---

### P2 — The 10-business-day restore window is measured from the notice, not the counter-notice

**Where:** `src/app/api/admin/dmca/route.ts:150-164` (`const from = notice.received_at`);
`src/app/admin/dmca/page.tsx:262-266`

**What happens:** §512(g) and the site's DMCA policy put the window "not less than 10 and not more
than 14 business days after receiving the **counter-notice**". The Restore button appears on the
original notice's card once its status is `counter_received`, and the route computes `earliest` and
`latest` from that row's `received_at` — the date the *original* notice arrived. A notice logged
four weeks ago that draws a counter-notice today is instantly restorable: `now > earliest` is
already true, the guard passes, and the material goes back up on day 0 of a window the claimant is
entitled to use to seek a court order. The `overdue` flag is wrong in the same direction — it will
report a same-day restore as past the 14-day limit. The confirm dialog the admin reads says
"Restoration becomes available 10 business days from now", which is what the code should do and does
not.

**Why it's real:** The `counter_received` action stamps only `status` and `acted_by`
(`route.ts:121-125, 183-184`), so no counter-notice date is recorded on that row at all; the
alternative workflow — logging the counter-notice as its own `kind: 'counter_notice'` row, which
`createSchema` allows — produces a row with the right `received_at` but no Restore button, because
the page only renders Restore for `status === 'counter_received'` and a new counter-notice row is
created with exactly that status while carrying no `listing_id` link to the original. Either way the
window is measured against the wrong date or the action is unreachable.

**Fix direction:** Add a `counter_received_at` column stamped by the `counter_received` action and
compute the window from it (falling back to refusing the restore when it is null). One line at the
stamp, one at `const from`.

---

### P2 — `accept-ship-by` writes calendar days into a column every reader treats as business days

**Where:** `src/app/api/orders/[id]/accept-ship-by/route.ts:42-47`

**What happens:** The comment says "Business days from the sale to the accepted date, so the same
`fulfillment_window_days` the cron and the badge read stays in one unit", and the arithmetic under it
is `Math.ceil((target - created) / 86_400_000)` — calendar days. Every reader treats the column as
business days: `cancel-unshipped` compares it against `businessDaysBetween(created_at, now)`
(`cancel-unshipped/route.ts:48-52`), as do `fulfillmentWindow()` and `evaluateProtection`. A buyer
who accepts a date 14 calendar days out has the column set to 14, so their right to cancel does not
open until 14 *business* days after the sale — about a week after the date they agreed to. They click
Cancel the morning after the artist misses the agreed date and are told "The artist still has until
14 business days after the sale to ship."

**Why it's real:** I checked whether any reader interprets the column as calendar days and none does;
the unit test at `src/utils/fulfillmentWindow.test.ts:46-49` feeds `20` to the business-day helper,
confirming the intended unit. The route is also the only writer besides checkout, which writes
`DEFAULT_FULFILLMENT_WINDOW_DAYS` (5 business days).

**Fix direction:** Convert with `businessDaysBetween(order.created_at, order.proposed_ship_by)`
instead of the millisecond division, and keep the `Math.max(1, …)` floor.

---

### P2 — The acceptance gate is enforced only in the route for messages and reviews; the tables still accept client inserts

**Where:** `src/app/api/messages/route.ts:43-47` and `src/app/api/reviews/route.ts:32-36` versus
`supabase/migrations/00038_launch_hardening.sql:101-108` and
`supabase/migrations/00012_review_security_fixes.sql:6-12`

**What happens:** D11 is explicit that the 403 — not the modal — is the enforcement, because "a modal
alone would be defeated by any client that never renders it". For checkout, listing create/publish
and all seven commission actions that holds: there is no client INSERT/UPDATE path to those tables
(00009 removed the commissions UPDATE policy, listing writes go through the route). For messages and
reviews it does not: "Participants can send messages" and "Buyers can review delivered orders" are
live INSERT policies, and any signed-in account can post either straight to
`/rest/v1/messages` or `/rest/v1/reviews` with the access token sitting in its own browser storage,
never touching the gated route. The same applies to listing photos and tags, which
`src/services/listings.ts:57-95` writes directly through supabase-js — an artist with an outstanding
acceptance cannot edit the listing's fields but can still replace all of its images.

**Why it's real:** I checked whether a trigger enforces acceptance at the row level and none does —
`guard_messages_insert` (00056) constrains `message_type`, not acceptance. This is the gap between
"the route refuses" and "the write is refused", and the arc's own reasoning is what makes it matter:
if the browser were the only client that mattered, the interstitial would have been enough.

**Fix direction:** Either accept this explicitly (the gate stops the app's own UI, which is what D11
practically needs) and say so in `acceptance.ts`, or add the check where the write happens — a
`terms_current()` SQL helper in the messages/reviews INSERT policies would close it for both without
touching the routes.

---

## Appendix: minor

- `code: 'acceptance_required'` (`src/lib/acceptance.ts:149`) has no consumer anywhere in `src/`; the
  comment promises the browser opens the interstitial on it, but nothing reads it.
- When `GET /api/account/acceptance` takes its deliberate fail-open path, the gated routes still 403
  with a message pointing at "the banner at the top of the page" — which that same failure has
  hidden.
- `MatureContext.ready` (`src/context/MatureContext.tsx:9-12`) is never consumed; its comment claims
  feed queries wait on it, while `useFeed` relies on `showMature` defaulting false. The behaviour is
  safe, the documentation is not.
- `admin/orders/[id]/return` `receive` and `waive` have no CAS (`.is('received_at', null)` /
  `.is('waived_at', null)`), unlike every other route in this batch; a second click silently re-stamps
  and can flip a `rejected` inspection to `accepted`.
- `authorizeReturn`'s upsert (`src/lib/orderReturns.ts:70-86`) re-authorising an already-shipped-back
  return resets `ship_by` and re-emails the buyer with a new 7-day clock.
- The DMCA `stamp()` helper replaces `notes` rather than appending, so each action overwrites the
  previous action's note on the same row.
- A PATCH that changes `status` on a DMCA-removed listing surfaces the guard's `RAISE EXCEPTION` as a
  500 with the raw message rather than the 409 the same route uses for its other refusals.
- `GET /api/admin/dmca` issues one `dmca_substantiated_count` RPC per distinct subject over 200
  notices; fine now, a visible stall at a few hundred.

## Not findings

- **`profiles.terms_*` cannot be forged.** No client write path exists: `profiles` has no INSERT
  policy, the four columns carry no UPDATE or SELECT grant, `guard_profiles_update` restores them for
  non-privileged writers, and every server writer (`acceptance` POST, `recordTermsOfSaleAcceptance`)
  stamps from `src/lib/agreement.ts` constants. db-smoke §10 pins all of it, including the backdating
  attempt.
- **The `documents` array only narrows.** The POST filters `outstandingAcceptances`' own result by the
  requested names, drops anything unrecognised, and never consults a client-supplied version; a
  non-artist asking for `artist_agreement` gets nothing because the outstanding set never contains it.
- **Gate placement.** All 13 gated routes call `acceptanceGateFor` immediately after the 401 and
  before any read, parse or write. Nothing is gated that should not be: `cancel-unshipped`,
  `accept-ship-by`, `concede-dispute` and `return-shipped` are rights rather than new commitments and
  are correctly ungated, and the Terms of Sale correctly do not block.
- **IDOR on the seven new routes.** `return-shipped` (buyer_id === user.id), `cancel-unshipped`
  (buyer or the order's artist, then `status === 'paid'`), `propose-ship-by` (artist.profile_id ===
  user.id), `accept-ship-by` (buyer_id === user.id), `concede-dispute` (artist.profile_id ===
  user.id), and both admin routes (`profiles.role === 'admin'` before anything else). All six
  non-admin routes read the order through the user-context client first, so someone else's id 404s at
  RLS before the ownership check even runs, and every one of them CASes on the field it is about.
- **`order_returns` RLS.** Buyer, that order's artist, and privileged contexts only; `REVOKE ALL`
  then `GRANT SELECT` to `authenticated` alone, so anon cannot reach it at any policy. An embedded
  join cannot widen it — PostgREST evaluates each table's policies independently, and db-smoke §14
  proves the outsider case under `SET ROLE authenticated` (the section explicitly fixed the vacuous
  owner-role version). No row exists before authorisation: `authorizeReturn` is the only creator and
  it writes `authorized_at` in the same statement as `return_address`.
- **The DMCA notice file is admin-only.** RLS `FOR ALL USING (is_privileged())`, `REVOKE ALL` from
  both browser roles, `dmca_substantiated_count` revoked as well, the route behind `requireAdmin`,
  the page behind `AuthGuard allowedRoles={['admin']}`, and db-smoke §13 asserts no table privilege
  of any kind for anon or authenticated. (Modulo the P0 above, which hands out the admin role.)
- **The artist cannot republish a removed listing by status or by clearing the stamp.**
  `guard_listings_update` copies `OLD.dmca_removed_at` over `NEW` and raises on any status change
  while it is set; the PATCH route writes under the user's session so the trigger applies, and
  db-smoke §13 pins both. Only the delete path (P1 above) gets around it.
- **`is_mature` is a content filter and nobody treats it as access control.** Every use is a query
  parameter or a client-side gate — feed, shelves, search suggestions, the artist's own grid,
  `MatureGate` — the listing page stays reachable by design (D8), sitemaps still include it, and the
  preference lives in `localStorage` for anonymous viewers with no row. The `!inner` embeds in
  `featured.ts` and `partnerPicks.ts` make the shelf filters real rather than nulling the embed.
  Default is false in every path including the storage-disabled `catch`, so the failure direction is
  "hide".
- **Terms of Sale stamped at Checkout Session creation** rather than at payment: the disclosure sits
  above the button that calls the route, so "reaching here is the acceptance" holds; the write is
  idempotent and never downgrades a version.
- **CSRF on `POST /api/account/acceptance`.** An unparseable body falls through to "accept everything
  outstanding", but `@supabase/ssr` cookies are SameSite=Lax, so a cross-site POST carries no
  session and the route 401s.
- **Signup stamping the Terms of Service (00063).** A scripted `auth.signUp` records an acceptance
  without the checkbox, but D12 rules that an account existing is the acceptance, and the only signup
  path in the app is the form. Honest limit of the ruling, not a defect.
- **The seven commission actions** each check requester or artist ownership explicitly and CAS on the
  status they expect; `updates` additionally refuses closed states.
