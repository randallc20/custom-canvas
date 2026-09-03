# Accounts, auth & access control — review 2026-09-03 (r6)

**Files read (opened in full unless noted):**

- `docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (D5–D13 and the 2026-09-02/03 block)
- `docs/reviews/01-auth-access-r2.md`, `-r3.md`, `-r4.md`, `-r5.md` — finding headings and the
  bodies of everything touching acceptance, DMCA and returns
- `docs/reviews/04-money-r5.md`, `-r6.md`, `-r7.md` — headings, plus the pickup-possession P0s
- `git log --stat -4` and the commit messages for `9bfe0ff`, `f865b9d`, `ef365e9`
- `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`,
  `src/services/acceptance.ts`, `src/components/legal/AcceptanceInterstitial.tsx`
- All 13 `acceptanceGateFor` call sites: `api/payments/checkout`, `api/listings` (POST),
  `api/listings/[id]` (PATCH), `api/messages`, `api/reviews`, `api/commissions` (POST),
  and `api/commissions/[id]/{accept,decline,confirm,complete,updates,dispute,withdraw-dispute}`
- The seven new order routes: `api/orders/[id]/{return-shipped,cancel-unshipped,propose-ship-by,accept-ship-by,concede-dispute}`,
  `api/admin/orders/[id]/{signature-confirmed,return}`; plus `approve-refund`, `confirm-pickup`,
  `api/admin/orders/[id]/refund` as their callers
- `src/lib/orderReturns.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillment.ts`,
  `src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/hooks/useOrderReturn.ts`
- `src/app/api/webhooks/stripe/route.ts` (the `charge.refunded` handler, 485–590)
- `src/app/api/admin/dmca/route.ts`, `src/app/admin/dmca/page.tsx`
- `src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`, and every `showMature`
  consumer (`services/feed.ts`, `services/featured.ts`, `services/partnerPicks.ts`,
  `hooks/useFeed.ts`, `components/listing/MatureGate.tsx`, `components/artist/SeriesTabs.tsx`)
- `src/services/listings.ts`, `src/services/orders.ts`, `src/lib/signedUpload.ts`,
  `src/app/api/storage/listing-image/route.ts`, `src/app/(auth)/onboarding/artist/page.tsx`,
  `src/app/api/artist/submit/route.ts`, `src/app/api/artist/application/route.ts`,
  `src/app/api/conversations/route.ts`, `src/services/conversations.ts`
- Migrations `00058`, `00063`, `00064`, `00065`, `00067`, `00068`, `00069`; and for the
  guards they restate, `00009`, `00037`, `00038`, `00052`, `00056`, `00057`, `00022`
- `scripts/db-smoke.sql` §10–16

**Skipped:** nothing in the stated scope. I did not re-derive the money-pass arithmetic
(`refundSplit`, `evaluateProtection`) beyond what the possession predicate needed.

**Verdict:** The acceptance record is genuinely tamper-proof — three independent locks, all
three pinned behaviourally in db-smoke, and I could not construct a forgery path from a client
of any role. The weakness this round is elsewhere and it is the same weakness as the last two
rounds: *local pickup*. `buyerTookPossession()` was created to be the one answer to "does the
buyer have the piece", and two of the three places that still decide that question for
themselves — the relist in `settleRefund` and the relist in the `charge.refunded` webhook —
were not converted, so a collected pickup piece goes back on sale. The DMCA machinery is the
other soft spot: it is written as if each notice is the only notice about its listing, and a
second notice against the same piece destroys the record of where the quarantined images went.

---

### P0 — A refund on a collected LOCAL PICKUP order puts the piece back on sale while it is in the buyer's house

**Where:** `src/lib/settleRefund.ts:210` and `:231-256`; the same decision again at
`src/app/api/webhooks/stripe/route.ts:517-521` and `:572-589`

**What happens:**

A buyer buys a local-pickup piece. They collect it at the studio and the artist taps "Confirm
pickup handoff"; the buyer never taps theirs. `confirm-pickup` only promotes the order to
`delivered` when *both* have confirmed, so the row sits at `status = 'paid'`, `shipped_at NULL`,
`delivered_at NULL`, with `pickup_confirmed_by_artist_at` set.

The buyer emails support: the piece has a tear. An admin refunds it from `/admin/orders` with
reason `damaged`. That reason is a fault reason, so `settleRefund` needs no artist approval; no
`order_returns` row exists (only `approve-refund` and the admin `return` route ever create one),
so `returnBlocksSettlement(null)` returns `null` and the settle proceeds. Stripe refunds, the
payout is reversed, the order closes.

Then line 210:

```ts
const wasShipped = order.status === 'shipped' || order.status === 'delivered';
```

`order.status` is `'paid'`, so `wasShipped` is false, the "no other live order" count is zero,
and line 240 sets the listing back to `status: 'available', sold_price_cents: null`. The
painting is now for sale on Custom Canvas while it hangs on the buyer's wall. The next
collector who buys it pays for a piece the artist does not have; that order passes
`orders_one_live_per_listing` because the first order is `refunded`, so nothing stops it, and
the artist finds out when they are asked to ship it.

The `charge.refunded` webhook has the identical hole for a refund issued from the Stripe
dashboard (the runbook's path). Its `wasShipped` at :517 is better — it also consults
`delivered_at` and `pre_dispute_status` — but a collected pickup order that only the artist
confirmed has none of those three, so it relists too.

The same thing happens on the change-of-mind path whenever an admin waives the return
("unnecessary" — the buyer is keeping it, just refund her), which is one of the four documented
grounds.

**Why it's real:** I looked for the innocent explanations and none holds.

- *The return gate stops it.* No. The gate is armed only when an `order_returns` row exists and
  is `required` and neither accepted nor waived. `/api/admin/orders/[id]/refund` never creates
  one, and a waived one returns `null` from `returnBlocksSettlement` (`src/utils/orderReturns.ts:96`).
- *`requireUnshipped` refuses pickup.* It does — `settleRefund.ts:88-95`, added by the r6 money
  fix — but only the cancel path sets that flag. The admin refund route does not.
- *Status is a good proxy.* It is for shipping: `notify-shipped` moves `paid → shipped` and the
  guard stamps `shipped_at` in the same write. It is not for pickup, which is exactly what
  `src/utils/fulfillment.ts:7-19` was written to say. `settleRefund` already selects `is_pickup`
  (line 64) and already reasons about it twenty lines earlier; it just does not reason about it
  here, and it does not select `pickup_confirmed_by_buyer_at` / `pickup_confirmed_by_artist_at`
  at all.
- *Both-confirmed pickups are safe.* They are — `status` is `delivered` — which is precisely why
  this only bites the case the r7 money pass established is the common one: the buyer who never
  taps the button.

**Fix direction:** Both relist sites should ask `buyerTookPossession(order)` rather than reading
`status`, which means adding `pickup_confirmed_by_buyer_at` and `pickup_confirmed_by_artist_at`
to both selects (`settleRefund.ts:64` and `webhooks/stripe/route.ts:493`). Because
`pickupPossessionUnknown` is a real state here too, the safe default for a pickup order nobody
confirmed is *not* to relist and to raise it for a human, the same direction `approve-refund`
already takes.

---

### P1 — A second "Remove material" on the same listing wipes the record of where its images were quarantined, and they can never be restored

**Where:** `src/app/api/admin/dmca/route.ts:288-292`, with `quarantineImages` at `:72-109` and
the restore readers at `:151` and `:362`

**What happens:**

Two claimants file about the same listing — or one claimant refiles a compliant notice after a
first attempt. The admin logs both. Both rows sit at status `received`, and the card renders
"Remove material" for each (`src/app/admin/dmca/page.tsx:241`), because that button is keyed on
the *notice's* status, not the listing's.

The admin acts on notice A: the listing is hidden and stamped, `quarantineImages` copies the
three images into `dmca-quarantine`, deletes them from `listing-images`, and
`listings.dmca_quarantined_paths` is set to those three paths.

The admin then acts on notice B, the same listing. `quarantineImages` runs again. It reads
`listing_images` — whose rows are never deleted by any of this — so `expected` is still 3. For
each, `admin.storage.from('listing-images').download(path)` now fails, because the object was
moved an hour ago, so every iteration `continue`s and `moved` is `[]`. Line 289 then runs
unconditionally:

```ts
await admin.from('listings').update({ dmca_quarantined_paths: moved }).eq('id', notice.listing_id);
```

`dmca_quarantined_paths` is now `[]`. Nothing else records those paths — 00069 deliberately
moved them off the notice row onto the listing, and the route no longer writes
`dmca_notices.quarantined_paths` at all. Every restore path (`:362`, and `undoRemoval` at `:151`)
reads that column, gets an empty array, restores nothing, and clears the listing's stamp. The
artist wins their counter-notice and gets back a listing with three broken images, with the
files sitting unreferenced in a private bucket.

The same call also tells the admin the opposite of the truth: `incomplete` is `0 < 3`, so the
route returns and the page toasts *"Only 0 of 3 images could be taken down. The rest are still
publicly reachable — check Sentry and remove them by hand before responding to the claimant."*
They are not publicly reachable; they were taken down an hour ago. An error-level Sentry line
fires with the same claim.

**Why it's real:** I checked whether the second removal is reachable. It is: the "Remove
material" button's condition is `n.status === 'received'` on that notice row, and a second
notice about the same listing is a distinct row in `received`. I checked whether
`quarantineImages` might still find the files — it downloads from `listing-images` by the path
parsed out of `listing_images.image_url`, and `remove_material` deletes neither the storage
object's replacement nor the `listing_images` rows, so the URL still points at a path that no
longer exists. And I checked whether the write is conditional — it is not; there is no
`.is('dmca_quarantined_paths', null)` and no `if (moved.length)`.

**Fix direction:** The quarantine write should merge rather than replace, and should not run at
all when the listing is already under a removal — `remove_material` on a listing whose
`dmca_removed_at` is already set has nothing to quarantine, and `expected` should be computed
from what is actually still public rather than from the `listing_images` row count.

---

### P1 — Marking one notice defective republishes material that another, still-substantiated notice took down

**Where:** `src/app/api/admin/dmca/route.ts:404-410` and `undoRemoval` at `:141-173`

**What happens:**

Continuing from the case above — two notices, A and B, both actioned with "Remove material", so
both are at `material_removed`. The admin reads notice B properly and decides it is plainly
defective (no sworn statement, no identification of the work). They click "Defective".

The route's last branch:

```ts
if (notice.listing_id && notice.status === 'material_removed') {
  const undone = await undoRemoval(admin, notice.listing_id as string);
```

`undoRemoval` clears `dmca_removed_at`, clears `pre_dmca_status`, restores the images and sets
the listing back to what it was — on the strength of notice B alone. Notice A, a valid notice
that Custom Canvas acted on, still stands at `material_removed`; nothing consults it. The
material the platform told claimant A it had removed is public again, and the admin's toast says
"Done." The card for notice A still reads "Material removed", so the log now asserts something
that is not true, which is the one thing `docs/reviews/01-auth-access-r5.md` established this
log must not do.

**Why it's real:** `undoRemoval` takes only a `listingId` and reads only the listing row; there
is no query anywhere in the file for *other* notices against the same listing. The single-notice
ordering is safe — if B was never removed, `notice.status` is `received` and the undo is
skipped — so this needs the double-removal above, which is why it sits below it. I could not
find a guard that makes the second removal impossible.

**Fix direction:** Before undoing a removal, count the other notices against the same
`listing_id` whose status is `material_removed` or `counter_received`; if any remain, stamp the
notice's new status but leave the listing removed, and say so in the response. The same check
belongs on `restore`.

---

### P2 — A notice under an open counter-notice counts toward repeat-infringer termination, which the column comment says it must not

**Where:** `supabase/migrations/00065_dmca_notices.sql:100-115` (`dmca_substantiated_count`),
its own `COMMENT` at `:46`, and `scripts/db-smoke.sql:1526-1536`

**What happens:**

```sql
AND status NOT IN ('withdrawn', 'defective', 'restored');
```

`counter_received` is not in that list, so it counts. The column comment two dozen lines above
says the opposite: *"counter_received pauses the count while it is resolved."*

An artist who disputes three notices — which the policy invites them to do, and which is the
only lever they have — spends the whole 10-to-14-business-day §512(g) window scored as three
substantiated notices. `/admin/dmca` renders the red badge (`page.tsx:226-228`), the DMCA policy
says three or more "ordinarily means termination", and the admin looking at that badge has no
signal that all three are under counter-notice. Only clicking Restore on each original notice
row moves them to `restored` and out of the count, and that cannot happen until day 10.

There is a second path to the same wrong number that needs no timing at all. The admin form has
a Kind dropdown, and `POST` handles it (`route.ts:216`): a counter-notice can be logged as its
own row. Nothing links that row to the notice it answers, and `restore` stamps `restored` on
whichever row it was invoked on. So an admin who logs the counter-notice separately and restores
from it leaves the original at `material_removed` — counted, permanently, for a claim the artist
successfully rebutted.

**Why it's real:** I checked the exclusion list against the policy text quoted in the migration
header ("where the user files a counter-notice that we accept, where the notice is withdrawn, or
where the notice is plainly defective") — `restored` is the code's stand-in for the first of
those, and it is only ever reached at the *end* of the window. db-smoke §13 inserts one row of
each status and asserts the count is exactly 3, so the test currently pins the contradiction
rather than catching it.

**Fix direction:** Add `counter_received` to the exclusion list and update the db-smoke
expectation to 2 in the same change; the column comment already describes the intended
behaviour. The separate-row workflow needs either a parent notice id or removing
`counter_notice` from the create form so counter-notices are only ever recorded on the notice
they answer.

---

### P2 — Quarantine is a one-way move with nothing stopping the artist re-uploading to the exact path the claimant checked

**Where:** `supabase/migrations/00038_launch_hardening.sql:165-167` (the `listing-images` INSERT
policy), `src/app/api/admin/dmca/route.ts:100-106`, `src/lib/signedUpload.ts:25`

**What happens:**

`quarantineImages` copies each object into the private bucket and then removes it from
`listing-images`. What it leaves behind is a `listing_images` row whose `image_url` still spells
out the full public path — readable by the artist, since it is their own listing — and a now-free
path in a bucket they may write to. The INSERT policy is:

```sql
WITH CHECK (bucket_id = 'listing-images' AND auth.uid()::text = (storage.foldername(name))[1])
```

and `signedUpload.ts:25` puts every upload at `${user.id}/...`, so every quarantined path is
inside the artist's own folder. One `supabase.storage.from('listing-images').upload(path, file)`
with their own session — the anon key and their cookie, no admin surface involved — restores the
exact URL the claimant sent us, still serving from a public bucket with a policy of
`USING (bucket_id = 'listing-images')`. The listing row stays hidden and stamped, so nothing in
the product shows the change, and the DMCA log still says "Material removed".

**Why it's real:** I tried to talk myself out of this three ways. The upload route can't be used
for it — it generates a random path — but the route is not the only door; storage RLS is, and it
checks only the folder. Bucket-level MIME and size limits (00012) don't help, since the original
was a JPEG under 5 MB. And the object is genuinely gone from `listing-images`, so there is no
duplicate-path conflict to trip over. The person with the motive to do this is precisely the
account under notice.

Marked **UNVERIFIED** on one point: I have not executed the upload against a live Supabase
project, so I am reading the policy rather than watching it pass. A `supabase.storage.upload()`
to a known-quarantined path from an artist session on DEV settles it in one call.

**Fix direction:** The removal should leave a tombstone the storage layer can see — either delete
the `listing_images` rows into a quarantine record of their own so the path stops being
discoverable, or narrow the `listing-images` INSERT policy so a path belonging to a listing with
`dmca_removed_at` set cannot be written. The second is the one that actually closes it.

---

### P3 — The acceptance POST answers 200 "recorded" when its own lookup fails, and the interstitial thanks the user for an acceptance that was never written

**Where:** `src/app/api/account/acceptance/route.ts:84-87`, reading
`src/lib/acceptance.ts:89-94`; the toast at `src/components/legal/AcceptanceInterstitial.tsx:96`

**What happens:**

`outstandingAcceptances` destructures only `data` from both of its queries and treats a null
profile as "owes nothing":

```ts
const { data: profile } = await admin.from('profiles').select(...).maybeSingle();
if (!profile) return [];
```

supabase-js does not throw on a query failure — it returns `{ data: null, error }`. So a
statement timeout or a pool exhaustion during the POST makes `all` empty, `outstanding` empty,
and line 87 returns `NextResponse.json({ accepted: [] })` with a 200. The mutation's `onSuccess`
fires: the modal closes, the dismissal flag is cleared, and the user is told *"Thank you — your
acceptance is recorded."* Nothing was stamped. Their next gated write 403s with "Our terms have
been updated", or — because the gate reads through the same helper — silently succeeds.

`{ accepted: [] }` is also the correct answer for a user who genuinely has nothing outstanding,
so the route cannot distinguish success from failure and neither can the client.

**Why it's real:** this is the same ignored-`error` root cause as the still-open r3 P2 (the gate
failing open), but it is a different surface with a different consequence: the r3 finding is a
write that should have been refused, this is a legal record the product claims to have written
and did not. `docs/CONVENTIONS.md` rule 2 — "every write's error path must reach the user" — is
the house standard this misses.

**Fix direction:** Have `outstandingAcceptances` surface its query errors (return them, or
throw) rather than folding them into an empty array, and make the POST distinguish "nothing
outstanding" from "could not determine what is outstanding", returning a 500 for the second. The
gate's fail-closed promise depends on the same change.

---

## Appendix: minor

- `MatureContext.ready` (`src/context/MatureContext.tsx:9-12`) has no consumers anywhere; its
  docstring says "Feed queries wait for it". They read `showMature` directly. The default is
  `false` — the safe direction — so this is a wasted first fetch and a content pop-in for an
  opted-in viewer, not a leak. It becomes a leak the day someone changes the default.
- `propose-ship-by` and `accept-ship-by` accept LOCAL PICKUP orders: their only status gate is
  `status !== 'paid' || shipped_at`, and a pickup order is `paid` with no `shipped_at` forever.
  `SalesSection.tsx:324` hides the control with `!order.is_pickup`, which is exactly the
  UI-hides-it/route-allows-it shape that produced the r6 and r7 pickup P0s. Harmless today
  because the cron and `cancel-unshipped` both refuse pickup.
- `restore` returns `images_restored: 0` unconditionally (`api/admin/dmca/route.ts:382`) even
  when `restoreImages` just moved four files back.
- `restore` does not check `notice.status`. A hand-built PATCH against a `received` notice more
  than 10 business days old sets its listing to `pre_dmca_status ?? 'hidden'` — i.e. hides a
  listing that was never removed. Admin-only and not reachable from the card, which only renders
  Restore for `counter_received`.
- Checkout stamps the Terms of Sale when the Stripe *session* is created
  (`api/payments/checkout/route.ts:203`), not when the order is submitted, which is what
  `recordTermsOfSaleAcceptance`'s docstring says. A buyer who abandons the Stripe page has an
  acceptance recorded for a purchase that never happened.
- `POST /api/account/acceptance` re-derives the outstanding set at stamp time rather than
  stamping what the GET displayed, so a set that changes between the two (a deploy bumping a
  version) records acceptance of a document the interstitial did not show. Very narrow.
- `undoRemoval` (`:164-171`) does not assert affected rows on its listing update the way the
  `remove_material` path does at `:268-285`; a zero-row update would report `listing_restored: true`.

## Not findings

Things I went at hard and concluded are sound:

- **Forging acceptance.** I traced every writer of `profiles.terms_*` and
  `artist_profiles.agreement_*`. Three independent locks, each pinned behaviourally: no column
  UPDATE grant (00052 grants only `full_name, avatar_url, email_preferences`, so a direct
  PostgREST write is 42501 before any trigger runs); `guard_profiles_update` (00058) restores all
  four columns for non-privileged writers; `guard_artist_profiles_insert` (00067) nulls both
  agreement columns at INSERT and `guard_artist_profiles_update` (00056) freezes them. db-smoke
  §10 and §15 assert the behaviour under both a service-role and an authenticated JWT. The
  onboarding insert no longer sends them and the spread `...data` cannot smuggle them past the
  trigger. No client-role forgery path exists.
- **The `documents` array only narrows.** `requested` is filtered against a literal allowlist and
  then used as `all.filter(o => requested.includes(o.document))`, where `all` is the server's own
  outstanding set. A document that is not outstanding cannot be added, and no version ever comes
  from the client — `STAMPS` reads the constants in `src/lib/agreement.ts`.
- **The signup trigger.** 00063's `handle_new_user` keeps 00023's role sanitiser (`artist` and
  `gallery` only, everything else → `user`), schema-qualifies every reference, and stamps the
  Terms of Service but deliberately not the Terms of Sale. db-smoke §12 clears `search_path` to
  reproduce GoTrue and asserts all three, including the escalation case that has regressed twice.
- **Gate placement.** All 13 routes call `acceptanceGateFor` on the line after the 401 and before
  any read, parse or write. No gated route does work first.
- **IDOR on the seven new routes.** `return-shipped` → `order.buyer_id !== user.id` → 403, plus a
  CAS on `authorized_at IS NOT NULL AND shipped_back_at IS NULL`. `cancel-unshipped` → `isBuyer ||
  isArtist` → 403, then a pickup refusal and a window check that applies only to the buyer.
  `propose-ship-by` → `artist.profile_id !== user.id` → 403, CAS on `status='paid' AND shipped_at
  IS NULL`. `accept-ship-by` → `buyer_id !== user.id` → 403, same CAS. `concede-dispute` →
  `artist.profile_id !== user.id` → 403, CAS on `dispute_conceded_at IS NULL`.
  `admin/signature-confirmed` and `admin/return` → `profiles.role !== 'admin'` → 403, and the
  first CASes on `signature_confirmed = false`. All five user-facing routes also read the order
  through the caller's RLS-scoped client, so someone else's order id 404s before the 403 is
  reached. Nothing here IDORs.
- **`order_returns` RLS.** `is_privileged() OR EXISTS(orders o WHERE o.id = order_returns.order_id
  AND (o.buyer_id = auth.uid() OR EXISTS(artist_profiles ap WHERE ap.id = o.artist_id AND
  ap.profile_id = auth.uid())))`, with `REVOKE ALL FROM anon, authenticated` and only `SELECT`
  granted back. anon has no grant at all, so the postal address is unreachable without a session.
  An embedded read (`orders?select=*,order_returns(*)` or the reverse) evaluates the embedded
  table's own policy, so it buys nothing; `is_privileged()` since 00052 is false for an anon-key
  request because `request.jwt.claims` is present with `role: anon`. db-smoke §14 asserts the
  buyer, the artist and an unrelated account under `SET ROLE authenticated` — the vacuous-pass
  trap is already noted and closed there. `useOrderReturns` selects `*` but under the caller's
  own session.
- **Reading the DMCA file.** `REVOKE ALL ON dmca_notices FROM anon, authenticated` plus a single
  `FOR ALL USING (is_privileged())` policy; `/api/admin/dmca` gates on `profiles.role === 'admin'`
  on every verb. 00068 fixed the `REVOKE ... FROM PUBLIC` omission on `dmca_substantiated_count`,
  and db-smoke §16 now pins that as a class over every non-trigger SECURITY DEFINER function
  rather than for the one that broke.
- **Getting a removed listing back.** By status: `guard_listings_update` raises. By clearing the
  stamp: the trigger restores `dmca_removed_at`, `pre_dmca_status` and `dmca_quarantined_paths`
  from OLD. By deleting: `guard_listings_delete` (00067) raises, and the FK is `ON DELETE
  RESTRICT`. By editing other columns: possible, but the status freeze means it stays hidden.
  db-smoke §13 covers the first three. The only real gap is the storage one above.
- **Ruling D8 is treated as a content filter, not access control.** `is_mature` is applied as a
  query predicate in `services/feed.ts:93`, `featured.ts:18`, `partnerPicks.ts:29` and
  `SeriesTabs.tsx:35`; the listing page stays reachable behind `MatureGate`'s click-through, the
  preference is `localStorage` only, and it is correctly absent from the feed's URL filters. No
  code anywhere treats it as a permission, and nothing on the server branches on it.
- **`GET /api/account/acceptance` fails open, and cannot be used to bypass the gate.** Its catch
  returns `{ outstanding: [], blocks: false }`, which only decides whether the modal and banner
  render. Every gated route calls `acceptanceGateFor` server-side and never consults the GET, so
  a client that forces the GET to fail (or simply never calls it) still gets a 403 on write.
  That half is correct.
- **But `acceptanceGate` does not actually fail closed.** Its docstring says "if the lookup
  itself throws, the write is refused". supabase-js does not throw on a query error — it returns
  `{ data: null, error }` — and `outstandingAcceptances` ignores `error` and reads a null profile
  as "owes nothing", so a database hiccup lets the gated write through. This is the still-open
  r3 P2, verbatim and unfixed, so I am recording it as the answer to the scope's question rather
  than re-raising it; the P3 above is the different surface the same root cause has since grown.
- **A gated action reachable another way.** The two I found are both already on file and neither
  has been made worse: listing images are written client-side and never pass the PATCH gate (r5
  P3), and the `messages` and `reviews` tables still accept client inserts under RLS with the
  gate living only in the route (r3 P2). Beyond those I checked every client-side write in
  `src/services` — the only direct write to `listings` is `deleteSeries` clearing `series_id`,
  and there is no client-side insert to `messages`, `reviews` or `commissions` anywhere.
