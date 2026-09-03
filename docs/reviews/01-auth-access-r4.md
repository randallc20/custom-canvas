# Accounts, auth & access control — review 2026-09-03 (r4)

**Files read:**
`docs/CONVENTIONS.md`, `README.md`; `docs/reviews/01-auth-access-r3.md` (in full) and
`04-money-r5.md`, `01-auth-access-r2.md`, `01-auth-access.md` (headings + the sections
that overlap this scope), to avoid re-reporting; `git show --stat 9bfe0ff`.
Scope: `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`,
`src/services/acceptance.ts`, `src/components/legal/AcceptanceInterstitial.tsx`,
all 13 `acceptanceGateFor` call sites (`payments/checkout`, `listings` POST,
`listings/[id]` PATCH, `messages`, `reviews`, `commissions` POST and the seven
`commissions/[id]/*`), `src/app/api/orders/[id]/{return-shipped,cancel-unshipped,
propose-ship-by,accept-ship-by,concede-dispute}/route.ts`,
`src/app/api/admin/orders/[id]/{signature-confirmed,return}/route.ts`,
`src/app/api/admin/dmca/route.ts`, `src/app/admin/dmca/page.tsx`,
`src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`,
`src/services/{feed,featured,partnerPicks,listings,messages}.ts`, `src/hooks/useFeed.ts`,
`src/hooks/useOrderReturn.ts`, `src/lib/orderReturns.ts`,
migrations `00058`, `00063`, `00064`, `00065`, `00066`, `00067`,
`scripts/db-smoke.sql` §10–14 (and §1b, §15).
Read as callers/context: `src/app/api/account/delete/route.ts`,
`src/app/api/artist/submit/route.ts`, `src/app/api/admin/listings/[id]/route.ts`,
`src/app/(auth)/onboarding/artist/page.tsx`, `src/context/AuthContext.tsx`,
`src/components/layout/ArtistSetupGuard.tsx`, `scripts/db-smoke.sh`, and migrations
`00001`, `00002`, `00009`, `00030`, `00032`, `00033`, `00037`, `00049`, `00051`, `00052`, `00056`.

Four claims below were **executed against the DEV database** (read-only introspection, plus
two `BEGIN … ROLLBACK` probes in the house `db-smoke` style — nothing was written):
the `dmca_substantiated_count` ACL, the anon call of it, the account-delete regression, and
its control case. Nothing in scope was skipped.

**Verdict:** The acceptance half of this arc is in good shape — 00067 closed the last
client-writable stamp, `order_returns` RLS is genuinely proven by §14, and the gate sits
before the work in all 13 routes with no second door into any gated action. The DMCA half is
not: its repeat-infringer count is readable by the anon key, its "remove material" leaves the
image serving from a public bucket, and its new `ON DELETE RESTRICT` has silently broken
account deletion for any artist with a notice on file.

---

### P0 — `dmca_substantiated_count()` is callable by `anon`: the repeat-infringer count for any account is readable with the public key

**Where:** `supabase/migrations/00065_dmca_notices.sql:103-119`; `scripts/db-smoke.sql:1469-1476`

**What happens:** The function is `SECURITY DEFINER` (so it reads `dmca_notices` past the
admin-only RLS policy) and line 119 is
`REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM anon, authenticated;`.
That revoke is a no-op. Postgres grants `EXECUTE` to `PUBLIC` on every new function, and
revoking from a role that holds the privilege only via `PUBLIC` does not remove the `PUBLIC`
grant. So anyone — signed in or not — can `POST /rest/v1/rpc/dmca_substantiated_count`
with `{"p_profile_id": "<any uuid>"}` and the anon key, and get back the number of
substantiated copyright notices standing against that account. Profile ids are enumerable:
`artist_profiles.profile_id` carries a SELECT grant (00033's dynamic re-grant excludes only
`rejection_reason`, `reviewed_by`, `reviewed_at`, `stripe_account_id`), so the whole public
artist directory can be walked and scored. What leaks is a count, not the notice body — but
the count is exactly the fact the table was made admin-only to protect: 00065's own comment
says "a notice names a claimant's contact details and an accusation against a user; neither
party gets to read the file."

**Why it's real:** Executed on DEV. `pg_proc.proacl` for this function is
`=X/postgres | postgres=X/postgres | service_role=X/postgres` — the leading `=X/` with an
empty grantee is the surviving `PUBLIC` grant, and `prosecdef` is `t`.
`has_function_privilege('anon', 'dmca_substantiated_count(uuid)', 'EXECUTE')` returns true, as
does the `authenticated` equivalent. In a rolled-back transaction I inserted two notices
against a real profile, `SET LOCAL ROLE anon`, and got:
`permission denied for table dmca_notices` on the direct read, and `2` from the function.
Compare `follower_count` (00052:128, `REVOKE … FROM PUBLIC` then an explicit grant) and
`my_unread_counts` / `artist_sales_totals` / `neighborhood_listing_counts` (00051:131-133,
`FROM public, anon, authenticated`) — their ACLs have no `=X/` entry. 00065 is the only
function in the schema that names the two roles and omits `PUBLIC`, so the house pattern is
already right everywhere else. db-smoke §13's header claims it pins "that neither browser role
can read the notice file", but the assertion at 1469-1476 reads
`information_schema.table_privileges` only — it never looks at `EXECUTE` on the function that
reads the table, which is why this shipped.

**Fix direction:** `REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM PUBLIC;`
(keeping the existing revoke, or replacing it with the 00051 `FROM public, anon, authenticated`
form), and grant nothing back — the only caller is `GET /api/admin/dmca` on the service role.
Add a `has_function_privilege('anon', …)` assertion to db-smoke §13 alongside the table check;
the same assertion over every `SECURITY DEFINER` function would have caught this class once.

---

### P1 — 00067's `ON DELETE RESTRICT` means an artist with a DMCA notice can never delete their account, and the failure is a raw FK error

**Where:** `supabase/migrations/00067_acceptance_and_dmca_hardening.sql:83-86`;
`src/app/api/account/delete/route.ts:66`

**What happens:** Account deletion is `admin.auth.admin.deleteUser(user.id)`, which cascades
`auth.users → profiles → artist_profiles → listings` (00001:53,144, all `ON DELETE CASCADE`).
00067 changed `dmca_notices.listing_id` from `ON DELETE SET NULL` to `ON DELETE RESTRICT`, and
`RESTRICT` is checked whatever initiated the parent delete — a cascade included. So an artist
who once had a listing removed on a copyright notice presses "Delete my account", every
pre-flight check in the route passes, and `deleteUser` fails with
`insert or update on table "dmca_notices" violates foreign key constraint
"dmca_notices_listing_id_fkey"`. The route returns that string verbatim as a 500. The account
is not deleted, there is nothing the person can do about it, and the message tells them
nothing. This is the same shape as the deviation 00049 had to make for `orders.listing_id`
("an artist with any order at all could never delete") — reintroduced on a different column.

**Why it's real:** Executed on DEV in a rolled-back transaction. With a `material_removed`
notice attached to an artist's listing, `DELETE FROM auth.users` as the service role failed
with exactly the message above. The control — the identical delete on the same artist with no
notice row — succeeded. The `guard_listings_delete` trigger is not what stops it: the route
deletes with the service role, so `is_privileged()` is true and the trigger passes; the FK is
the blocker, and a foreign key does not care about `is_privileged()`. db-smoke §13 asserts
`confdeltype = 'r'` (line 1538) but never exercises the cascade, so the smoke test confirms the
constraint and misses the consequence.

**Fix direction:** Keep `RESTRICT` — losing the notice's link is the thing it was added to
prevent — and handle it in the delete route instead: check for `dmca_notices` rows against the
account's listings alongside the open-order check and refuse with a written message
(the `OPEN_ORDER_MESSAGE` pattern), or detach the notice deliberately (`listing_id → NULL`
with the listing title copied into `notes`) before the cascade. The second keeps self-service
deletion working, which is a GDPR/CCPA-facing promise on the account page.

---

### P1 — "Remove material" hides the listing but leaves the image serving from a public bucket

**Where:** `src/app/api/admin/dmca/route.ts:127-170`;
`supabase/migrations/00002_missing_tables_and_policies.sql:220-227`

**What happens:** `remove_material` updates two rows — `listings` (status `hidden`,
`dmca_removed_at`, `pre_dmca_status`) and the notice — and touches storage not at all. The
`listing-images` bucket is `public = true`, and a public Supabase bucket serves object GETs
with no policy evaluation whatsoever (00056's own comment says so: "Public buckets serve
object GETs without any policy"). So after the admin clicks Remove material, the infringing
file is still returned by
`https://<project>.supabase.co/storage/v1/object/public/listing-images/<uid>/<file>` — which
is, in practice, the exact URL the claimant pasted into their notice, since that is the `src`
on the listing page they were complaining about. §512(c)(1)(C) asks for the material to be
removed *or access to it disabled*; hiding the row that links to it does neither for the file.
The claimant re-checks the URL they sent, sees the work still up, and the admin UI has already
recorded `material_removed`.

**Why it's real:** I checked for any other remover and there is none: nothing in
`src/app/api/admin/dmca/route.ts` imports the storage client, `src/services/listings.ts`
deletes `listing_images` *rows* only (`deleteListingImage`, lines 110-120) and never the
object, and 00056 deliberately dropped the storage SELECT policies without making the buckets
private — its own reasoning is that the policies only ever governed *listing*, because object
reads bypass them. I also confirmed the bucket's flag directly on DEV:
`SELECT public FROM storage.buckets WHERE id='listing-images'` → `true`. The one innocent
explanation I could construct — that hiding the listing is enough because the URL is
unguessable — does not survive the fact that the notice itself supplies the URL.

**Fix direction:** On `remove_material`, move or delete the listing's storage objects as well
as hiding the row: read `listing_images.image_url` for the listing, `storage.from('listing-images')
.remove([...])` on the service role (or copy into a private `dmca-quarantine` bucket first so
the restore path can put them back, which pairs with `pre_dmca_status`). Whichever way, the
restore action needs the mirror-image step, and db-smoke §13 should assert the objects are gone.

---

### P3 — Since 00067, an `artist_profiles` row created by a non-`artist` role can never have its agreement stamped, and submit-for-review refuses it forever

**Where:** `src/lib/acceptance.ts:99-108`; `src/services/acceptance.ts:52-63`;
`src/app/api/artist/submit/route.ts:29-34`; `supabase/migrations/00001_initial_schema.sql:106`

**What happens:** `Artists can insert own profile` is `WITH CHECK (auth.uid() = profile_id)`
with no role condition, and `/onboarding/artist` guards on session only — neither checks that
`profiles.role = 'artist'`. Before 00067 that was harmless: the browser stamped
`agreement_version` in its own INSERT, so a `user`-role account that completed the wizard could
still submit for review. Now `guard_artist_profiles_insert` nulls both columns, and the
server-side stamp cannot recover them: `outstandingAcceptances` only considers
`artist_agreement` inside `if (profile.role === 'artist')`, so for a `user`-role account the
outstanding set never contains it, `recordArtistAgreementAcceptance()`'s
`post(['artist_agreement'])` filters down to nothing, and the route answers **200
`{accepted: []}`**. The person finishes onboarding, builds a shop, presses Submit for review,
and gets "Please review and accept the current Artist Agreement before submitting" — with no
surface anywhere that can accept it, because the interstitial is driven by the same
role-gated function and never asks either.

**Why it's real:** I tried to kill this on reachability and it survives, narrowly.
`postSignupPath` (AuthContext.tsx:21) and `ArtistSetupGuard` (line 39) both route to
`/onboarding/artist` on `role === 'artist'` only, and a grep for `onboarding/artist` across
`src/` finds no other link — so there is no in-app path a buyer can click, and role is
admin-only to change (00023 sanitiser + `guard_profiles_update`). It takes someone typing the
URL. What makes it worth a line rather than nothing is the shape: a success-coded response
(`200 {accepted: []}`) for a stamp that did not happen, and a dead end with no UI exit.

**Fix direction:** Have the POST return a 409 when a `documents` list narrows to nothing while
the caller explicitly asked for something — silence is the bug, not the refusal. Separately,
either add `role === 'artist'` to the `artist_profiles` INSERT policy and the onboarding page,
or drop the role condition in `outstandingAcceptances` and key the artist-agreement branch on
"an `artist_profiles` row exists" instead, which is the fact that actually matters.

---

## Appendix: minor

- `dmca_substantiated_count` counts `counter_received` notices, while
  `COMMENT ON COLUMN dmca_notices.status` (00065:47-48) says "counter_received pauses the count
  while it is resolved". db-smoke §13's `expected 3` enshrines the counting behaviour, so the
  comment is the thing that is wrong — but an artist can currently be shown as a repeat
  infringer on the strength of notices they have formally contested.
- `current_terms_version()` also carries the default `PUBLIC` EXECUTE grant (confirmed on DEV).
  Harmless — it returns the literal `'2.0'` — but it is the same root cause as the P0.
- The same `PUBLIC`-execute pattern is on the pre-existing `blocked_by(uuid)` and
  `sender_is_blocked(uuid)`, both `SECURITY DEFINER`. Outside this arc's scope and not raised
  by earlier passes; worth a look in whichever pass owns blocking.
- The `guard_listings_delete` `RAISE EXCEPTION` surfaces from `DELETE /api/listings/[id]` as a
  500 with the raw Postgres text, though the message itself is user-ready. The route already
  translates `23503` into a 409; `P0001` needs the same two lines. (r3 flagged the equivalent on
  PATCH; the DELETE path is new in 00067.)
- `POST /api/account/acceptance` treats a non-array `documents` (e.g. `"terms"`) as absent and
  stamps everything outstanding. Not exploitable — both callers send proper arrays — but it is
  the "record an acceptance nobody was shown" direction the file exists to prevent.

## Not findings

- **`profiles.terms_*` and `artist_profiles.agreement_*` cannot now be forged.** I re-traced
  every writer after 9bfe0ff: `handle_new_user` (server constant, role sanitised, §12 pins
  both), the acceptance POST (service role, versions from `src/lib/agreement.ts`),
  `recordTermsOfSaleAcceptance` (service role). Client paths are closed at three layers —
  no column grants, `guard_profiles_update`'s freeze, `guard_artist_profiles_update`'s freeze
  (00056:193 preserved 00037's two lines; I checked, because this is exactly where a rebuild
  would have dropped them), and now `guard_artist_profiles_insert`'s null-out. db-smoke §10 and
  §15 assert the backdating attempt from both sides.
- **The signup stamp is honest.** `handle_new_user` stamps the ToS for every new `auth.users`
  row, so I looked for a signup path with no checkbox: there is no `signInWithOAuth`, no
  `signInWithOtp`, and the only `admin.createUser` is `scripts/seed-e2e.mjs`. The registration
  form is the sole route in, and it will not submit without the D12 checkbox.
- **The `documents` array only narrows** — it filters the server's own outstanding set and
  never carries a version. (Same conclusion as r3; re-verified because 00067 changed what
  reaches that set.)
- **The gate is before the work in all 13 routes**, immediately after the 401 and before any
  parse, read or write. Nothing is gated that should not be.
- **No gated action has a second door.** Messages and listings write only through their routes
  (`services/messages.ts:57`, `services/listings.ts:44-51`); commissions and reviews are read-only
  client-side; and there is exactly one `checkout.sessions.create` in the codebase, inside the
  gated route — so there is no separate commission-payment path. (The table-level insert gap on
  `messages`/`reviews` via raw PostgREST is r3's open P2, unchanged by 9bfe0ff and not
  re-reported.)
- **IDOR on the seven new routes.** Re-verified each after the 00066 changes: the five
  non-admin routes read the order through the user-context client first (someone else's id 404s
  at RLS before the ownership test), then check buyer / artist / either explicitly, then CAS on
  the field they own. Both admin routes check `profiles.role === 'admin'` before anything else.
- **`order_returns` RLS does what it claims.** The policy admits privileged contexts, the
  buyer, and the order's artist only, `REVOKE ALL` + `GRANT SELECT` leaves no client write, and
  an embedded join cannot widen it — PostgREST evaluates RLS on the embedded relation, and
  there is no view or `SECURITY DEFINER` function over the table (I grepped every reference).
  db-smoke §14 proves it properly, including the outsider case and — importantly — the
  `SET ROLE` that stops the whole section passing vacuously as table owner.
- **The DMCA removal sticks at the row level.** Status change, clearing the stamp, and delete
  are all refused for the artist (§13 exercises all three), `pre_dmca_status` is frozen too, and
  the listing PATCH route updates through the *user's* session, so the guard applies to it as
  well — there is no service-role republish door. The image file is the gap, and that is P1
  above.
- **A non-admin cannot read the notice file.** `dmca_notices` is `REVOKE ALL` from both browser
  roles with an `is_privileged()`-only policy, `/api/admin/dmca` checks `role === 'admin'` on
  all three verbs, and the page sits behind `AuthGuard allowedRoles={['admin']}`. The leak is
  the count function, not the table.
- **`GET /api/account/acceptance` fails open by design and cannot be used to bypass the gate.**
  It only decides what to render; the stamp is written by the POST, which re-derives the
  outstanding set server-side. (`acceptanceGate` also failing open on an ordinary query error is
  r3's open P2 — still true, untouched by 9bfe0ff, not re-reported.)
- **D8 is treated as a content filter, not access control, everywhere.** `showMature` is a
  localStorage preference threaded through `useFeed`, `feed.ts:93`, `featured.ts:18`,
  `partnerPicks.ts:29`, `SeriesTabs` and `MatureGate`; nothing keys a permission, an RLS clause
  or a route decision on it, and hide-by-default is the failure mode in every branch including
  the storage-unavailable one.
- **00066/00067 did not repeat the rebuild mistake.** `guard_orders_update` (00066) and
  `guard_artist_profiles_insert` (00067) are restated in full from their latest bodies with the
  additions marked, and `guard_listings_update` was first created in 00065, so 00067's replace
  has no older body to lose. I diffed all three.
