# Accounts, auth & access control — review 2026-09-03

**Files read.** Context: `docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`, and
every prior report (`01-auth-access.md`, `-r2` … `-r7`, `04-money-r5` … `-r9`),
plus `git log --stat -5` and `git show 25fc3b9 -- src/app/api/admin/dmca/route.ts`.

Acceptance: `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`,
`src/services/acceptance.ts`, `src/components/legal/AcceptanceInterstitial.tsx`,
`src/app/providers.tsx`, `src/app/(auth)/register/page.tsx`,
`src/context/AuthContext.tsx`. All 13 `acceptanceGateFor` call sites:
`api/payments/checkout`, `api/listings` POST, `api/listings/[id]` PATCH,
`api/messages`, `api/reviews`, `api/commissions` POST and the seven
`api/commissions/[id]/{accept,complete,confirm,updates,dispute,withdraw-dispute,decline}`.

Orders: `api/orders/[id]/{return-shipped,cancel-unshipped,propose-ship-by,accept-ship-by,concede-dispute,approve-refund,confirm-pickup}`,
`api/admin/orders/[id]/{signature-confirmed,return}`, `api/cron/fulfillment-windows`,
`src/lib/{settleRefund,cancelUnshipped,orderReturns,assessProtection}.ts`,
`src/utils/{fulfillment,orderReturns,orderReturns.test,disputeOutcome}.ts`,
`src/components/studio/SalesSection.tsx`, `src/app/admin/orders/page.tsx`,
`src/app/(user)/orders/page.tsx`, `src/hooks/useOrderReturn.ts`,
the `charge.refunded` branch of `api/webhooks/stripe/route.ts`.

DMCA / mature: `api/admin/dmca/route.ts`, `app/admin/dmca/page.tsx`,
`src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`,
`src/services/{feed,featured,partnerPicks}.ts`, `src/components/listing/MatureGate.tsx`,
`src/components/artist/SeriesTabs.tsx`.

SQL: 00058, 00063, 00064, 00065, 00067, 00068, 00069 in full; the
`guard_profiles_update` / `guard_artist_profiles_update` / `guard_listings_update`
bodies in 00009, 00030, 00037, 00052, 00056; `is_privileged()` (00052); the
storage policy history (00002, 00012, 00038, 00056); the `listings`, `orders`,
`artist_profiles` and `commissions` policies (00001, 00036).
`scripts/db-smoke.sql` §10–16.

**Not read:** the Stripe webhook outside `charge.refunded`, the dispute
lifecycle migrations (00050/00057) beyond their guard bodies, and
`evaluateProtection` internals — all money-pass scope and untouched by the
legal-alignment arc.

**Verdict.** The acceptance record is genuinely server-owned: I could not find
any path by which an account writes, backdates or downgrades its own
`terms_*` or `agreement_*`, the `documents` array only ever narrows, and the
open/closed split does what its comments claim. The two live problems are both
in the newest fixes — the possession answer the artist gives at approve-refund
is thrown away and re-derived to the opposite conclusion at settle time, and
the r7 restore guard was copied from its sibling with one status dropped, which
puts the same republish-on-a-live-notice hole back on a different door.

---

### P1 — The artist's "the buyer never collected this piece" answer is never persisted, so the settle gate re-derives possession, refuses, and the only unblock emails the buyer a return address and a seven-day clock for a piece they never had

**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:50-63` and `:98-111`;
`src/lib/settleRefund.ts:146-152`; `src/utils/orderReturns.ts:93-107`;
`src/components/studio/SalesSection.tsx:469-486`;
`src/app/admin/orders/page.tsx:290-292`, `:313-324`, `:352-357`.

**What happens.** A local-pickup order sits at `paid` with neither
`pickup_confirmed_by_artist_at` nor `pickup_confirmed_by_buyer_at` — the state
r7's P0 was about. The buyer asks for a refund in chat; the artist opens
"Approve refund" in Studio and ticks *"The buyer never collected this piece — it
is still with me."* The modal answers *"there is nothing to send back — no
return address needed"*, the POST body is `{ piece_not_collected: true }`,
`needsReturn` is false, **no `order_returns` row is written**, and the toast
says "Refund approved — Custom Canvas will settle the payment."

Nothing persists that answer. There is no `piece_not_collected` column anywhere
in `supabase/migrations`, and `authorizeReturn` was skipped, so the row the
admin settles from is byte-for-byte the row that existed before the artist
answered. When the admin presses **Settle refund**, `settleRefund` recomputes
the same question from the order:

```ts
returnRequiredByDefault(opts.reason, buyerTookPossession(order) || pickupPossessionUnknown(order))
```

For this order `pickupPossessionUnknown` is true, so `owedWhenUnrecorded` is
true, `returnBlocksSettlement(null, true)` fires, and the settle 409s with
*"This refund should be conditioned on the piece coming back. Use 'Require a
return…' on the order first, or waive it with a reason."*

The admin cannot take either branch cleanly. The **Settle refund** button is
rendered because `admin/orders/page.tsx:291` calls
`returnBlocksSettlement(returns[o.id] ?? null)` with no second argument, so the
page's copy of the gate says "not blocked" while the server's says "blocked" —
a button that exists only to be refused, which is the exact thing
`25fc3b9` removed for the *recorded*-return case. **Waive return** is not
offered at all: its branch is inside `if (!ret …) return null`, and there is no
`ret`. The only control left is **Require a return…**, which posts
`{action:'authorize', reason, return_address}` with `required` unset —
so `authorizeReturn` computes `required = returnRequiredByDefault(reason, true)`
= true for `change_of_mind`, stamps a seven-day `ship_by`, posts a system
message into the thread, sends an in-app bell and calls
`sendReturnAuthorizedEmail` telling the buyer to ship back a painting they never
collected, to an address the admin had to type. Only then does **Waive return**
appear.

The same discarded answer costs the artist a second time: `settleRefund:232`
computes `wasShipped = !pieceIsWithArtist(order)`, which is `true` for a
pickup-unknown order, so the listing is not relisted — even though the artist
has just stated in the product that the piece is still with them.

**Why it's real.** I looked for a persist site and there is none: `grep -rn
"piece_not_collected\|pieceNotCollected" src` returns five hits, all of them the
checkbox, the two mirrored `needsReturn` expressions, and the request body — the
value is read once at `approve-refund/route.ts:63` and dropped. The innocent
explanation would be that `returnBlocksSettlement`'s `owedWhenUnrecorded`
defaults to `false`, so no record means no block — that was true until
`25fc3b9`, which added the argument to close r9's P1 and made "no record" mean
"work it out yourself" on every settle door. I checked that the modal's
"nothing to send back" copy is reachable in exactly this state
(`SalesSection.tsx:469` renders the checkbox only when
`pickupPossessionUnknown(refundOrder)`), and that `approve-refund` accepts
`paid` pickup orders (`:38`). The waive route genuinely needs a pre-existing
row: `admin/orders/[id]/return/route.ts:101-117` updates `order_returns` by
`order_id` and 409s on zero rows.

**Fix direction.** The artist's answer is a possession fact and has to be
recorded where the settle gate reads: on the `piece_not_collected` path, write
the `order_returns` row with `required: false` (and a `reason`) instead of
writing nothing, so the gate sees a decision rather than re-deriving one. Also
pass the same `owedWhenUnrecorded` the server uses into the admin page's
`returnBlocksSettlement` call so the Settle button and the server agree.

---

### P1 — DMCA `restore` counts a notice under an open counter-notice as "not live", so restoring one claim republishes material a different claimant's notice took down, inside that claimant's own §512(g) window

**Where:** `src/app/api/admin/dmca/route.ts:356-362` (restore) against
`:448-454` (withdraw / defective).

**What happens.** Listing L has two notices from two claimants. Both are acted
on with `remove_material`; the artist counter-notices A on day 1 and B on day 5,
and the admin records both with **Counter-notice received**, so A and B are both
at `counter_received`. Ten business days after A's counter-notice the admin
presses **Restore** on A. The "other live notices" check runs

```ts
.in('status', ['received', 'material_removed']).neq('id', id)
```

B is at `counter_received`, which is not in that list, so the count is 0. The
listing's `dmca_removed_at` is cleared, `dmca_quarantined_paths` is emptied,
`restoreImages` copies every quarantined file back into the public
`listing-images` bucket, and the listing returns to `pre_dmca_status`. B's
claimant has had their material put back roughly a week before their own
ten-business-day window closes, and B's row still reads `counter_received` with
no record that the material it removed is public again.

**Why it's real.** The sibling path four lines of code away defines "live" the
other way: the withdraw/defective guard at `:453` is
`.in('status', ['received', 'material_removed', 'counter_received'])`, with the
comment *"Only if THIS was the last live notice against the piece."* So the
codebase's own definition of a live notice includes `counter_received`, and the
restore path is the one that departs from it. The innocent reading would be that
`counter_received` means the notice is no longer substantiated —
`dmca_substantiated_count` does exclude it (00069) — but that function answers a
different question (does this count toward *termination*), and 00069's comment
says so explicitly: it excludes it so a user disputing in good faith is not
counted *while it is unresolved*. Unresolved is not resolved. `git show
25fc3b9 -- src/app/api/admin/dmca/route.ts` confirms this check is the newest
code in the file: it was added last commit to close r7's P1, described in the
message as "Same guard the withdraw path got last round" — and it is not the
same guard.

**Fix direction.** Use one shared constant for the live-notice status set and
have both call sites take it, so the two can never drift again. `restore` should
additionally refuse (or warn) while any *other* notice against the listing has a
counter-notice inside its own 10-to-14-business-day window, since that window is
per-notice under §512(g).

---

### P2 — A notice at `counter_received` has no way to be marked withdrawn or defective: the UI offers nothing, and the API path for those two actions stamps the status without undoing the removal

**Where:** `src/app/admin/dmca/page.tsx:252` and `:273`;
`src/app/api/admin/dmca/route.ts:444` and `:471-473`.

**What happens.** A notice is logged, the material is removed, the artist
counter-notices, and the admin records **Counter-notice received**. The claimant
then withdraws the notice the next day (or the admin realises it was plainly
defective all along). The card's Withdrawn and Defective buttons are gated on
`['received','material_removed'].includes(n.status)` at `page.tsx:252`, so at
`counter_received` neither is rendered — the only control is **Restore**, and
`route.ts:343-350` refuses that for ten business days. The artist's listing and
its images stay down for two more weeks over a claim nobody is making any more,
and the withdrawal cannot be recorded at all.

Going round the UI makes it worse rather than better. `route.ts:444` gates the
undo on `notice.status === 'material_removed'`, so `PATCH {action:'withdraw'}`
on a `counter_received` notice falls through to the bare stamp at `:471`, sets
the status to `withdrawn`, and returns `listing_restored: notice.status ===
'material_removed'` — i.e. `false`. The listing keeps `dmca_removed_at`, its
images stay in the private quarantine bucket, and its status is now
`withdrawn`, which renders neither Restore nor anything else. The artist can
neither republish (`guard_listings_update` raises) nor delete
(`guard_listings_delete` raises). That is r5's P1 exactly, one status along.

**Why it's real.** I read both branch conditions and the card's button gates. The
innocent explanation would be that a counter-notice makes withdrawal moot — but
the two facts are independent: a counter-notice is the *user's* assertion, a
withdrawal is the *claimant's*, and only the second one means the notice never
counted. r5's P1 fix taught the withdraw and defective paths to undo a removal;
it taught them for one status. The UI-only path does have an exit (wait, then
Restore), which is why this is P2 rather than P1; the API path does not.

**Fix direction.** Drive the undo off "was this listing removed" —
`listings.dmca_removed_at IS NOT NULL` — rather than off the notice's own
status, and let the card offer Withdrawn/Defective on `counter_received` too.

---

### P2 — The DMCA log tells the admin the listing and its images were restored on every withdrawn or defective notice, including the ones the route explicitly refused to restore and the ones where nothing was ever removed

**Where:** `src/app/admin/dmca/page.tsx:268-272`, against
`src/app/api/admin/dmca/route.ts:458-469`.

**What happens.** The card renders

```tsx
{['withdrawn', 'defective'].includes(n.status) && n.listing && (
  <span>Not substantiated — the listing and its images were restored.</span>
)}
```

with no condition on whether a restore actually happened. Two states make it
false. First, the case r6's P1 fix created: marking notice A defective while
notice B still stands returns `listing_restored: false` plus a warning, the
toast shows the warning once, and on the next `load()` the card settles into
"the listing and its images were restored" — for a listing that is still hidden
with its images in quarantine. Second, and more common: any notice marked
withdrawn or defective straight from `received`, where nothing was ever taken
down, gets the same sentence.

**Why it's real.** The route returns the truth (`listing_restored`, and a
`warning` string), and the page throws it away after the toast — `act()` only
keeps `body.warning` for the toast and then calls `load()`, which re-reads
notices and knows nothing about the last response. This is an admin's record of
what the platform did in response to a notice, which is the file the safe
harbour rests on; a log that asserts a restoration that did not happen is
worse than one that says nothing.

**Fix direction.** Decide the sentence from data the card already has —
`n.listing.dmca_removed_at` is selected by the GET (`route.ts:182`) — and say
"still down: another notice stands" when it is still set.

---

### P3 — The `acceptance_required` code the gate returns has no consumer, so in the read endpoint's fail-open window the 403 points the user at a banner that is not on screen

**Where:** `src/lib/acceptance.ts:146-170`;
`src/app/api/account/acceptance/route.ts:33-41`;
`src/components/legal/AcceptanceInterstitial.tsx:60-80`;
`src/app/checkout/[listingId]/page.tsx:95-110`.

**What happens.** `GET /api/account/acceptance` fails open by design, returning
`{outstanding: [], blocks: false}`, and the interstitial caches that for its
five-minute `staleTime`. During that window `asking` is false, so neither the
dialog nor the standing banner renders. The user then presses Pay: the gate
does its own lookup, succeeds, and 403s with *"…you can do it from the banner at
the top of the page."* There is no banner. The 403 body carries
`code: 'acceptance_required'` and the full `outstanding` list precisely so the
browser can open the interstitial instead — `acceptance.ts:151-153` says so in
words — and `grep -rn "acceptance_required" src` finds no reader anywhere. The
checkout page toasts `err.error` and stops.

**Why it's real.** Confirmed both halves: the fail-open return path, and the
absence of any client that inspects `code`. This is not a bypass — the gate
still refuses, which is the important half — but it is the one seam where the
two deliberately opposite failure modes meet, and it leaves the user with an
instruction they cannot follow until they reload.

**Fix direction.** Have the shared fetch wrapper (or each mutation's `onError`)
recognise `code === 'acceptance_required'`, seed the acceptance query from the
403's own `outstanding` payload, and open the dialog.

---

### P3 — `acceptanceGateFor` throws instead of returning a refusal, so a transient lookup failure is an unhandled 500 in all 13 gated routes rather than the 503 the write endpoint was taught to return

**Where:** `src/lib/acceptance.ts:95-133` and `:158-176`; every call site, e.g.
`src/app/api/payments/checkout/route.ts:40-41`,
`src/app/api/messages/route.ts:46-47`.

**What happens.** `outstandingAcceptances` was changed in `8d3d347` to throw on
a query error rather than return `[]` — correct, and it is what makes the gate
fail closed. But `acceptanceGate` does not catch, and none of the 13 call sites
wraps the `await` (checkout's `try` starts ~150 lines later, at the Stripe
call). A pooler blip on the `profiles` read therefore escapes as an unhandled
exception and Next returns a generic 500 with no `error` string, so the
checkout page toasts "Something went wrong" and the message composer shows a
raw failure. The POST on the same module was given a deliberate 503 with a
human sentence for exactly this case (`account/acceptance/route.ts:88-97`); the
gate has no equivalent.

**Why it's real.** Read the throw sites, the gate, and the call sites; nothing
between them catches. It genuinely fails closed, which is why this is P3 and not
higher — the defect is that the refusal is indistinguishable from a bug, on the
one code path the arc most needs to be legible.

**Fix direction.** Have `acceptanceGate` catch, capture to Sentry, and return a
sentinel the routes can map to a 503 with the same sentence the POST uses —
one shape for "we could not check", not two.

---

## Appendix: minor

- The gate is route-only for **listings create/edit and commissions create**, not
  just for messages and reviews as r3's P2 recorded: `listings` still carries
  "Artists can insert own listings" / "Artists can update own listings" (00001)
  and `commissions` still carries "Users can create commissions" (00001, guarded
  but not removed by 00056), so four of the 13 gated actions are one PostgREST
  call from the browser's own session key. Same root cause as the known P2; the
  new information is which tables.
- `handle_new_user` (00063) stamps `terms_version` on every `auth.users` insert.
  The only thing standing between that and a recorded acceptance nobody was
  shown is a disabled submit button in `register/page.tsx:35-38` — a scripted
  `supabase.auth.signUp` with the public anon key produces an identical record.
  Inherent to click-wrap rather than a defect, but worth knowing before the
  record is ever relied on.
- `recordTermsOfSaleAcceptance` runs when the Stripe **session is created**
  (`checkout/route.ts:203`), not when it is paid, so an abandoned checkout
  records a Terms of Sale acceptance. The doc comment says "recorded when the
  order is submitted".
- `admin/orders/page.tsx:105` loads `order_returns` with a bare `.limit(500)`
  and no ordering; past 500 rows the settle button starts appearing on orders
  with an outstanding return. Server-gated, so cosmetic today.
- `services/feed.ts:202` (search suggestions) hard-codes `.eq('is_mature',
  false)` with no `showMature` parameter, so a viewer who has opted in still
  gets mature work filtered out of suggestions — the one D8 surface that ignores
  the opt-in.
- Two of the seven gated commission actions are exits rather than commitments:
  `decline` (cancel your own request) and `withdraw-dispute` (take back a
  dispute you raised). Blocking a de-escalation on an unaccepted term is the
  one shape D11's "browsing stays open" reasoning argues against.
- `admin/orders/[id]/return`'s `receive` and `waive` have no compare-and-swap,
  so a second `receive` overwrites a recorded `rejected` inspection with
  `accepted`. Admin-only, and arguably a correction path, but it is the one
  write on that table with no CAS.
- `remove_material` does nothing to a live order against the removed listing:
  the buyer's paid order stands and the artist can still ship the noticed work.
  Support can refund it, but nothing surfaces the collision to them.

## Not findings

Things I read closely and concluded are correct:

- **Forging acceptance.** Every writer of `profiles.terms_*` and
  `artist_profiles.agreement_*` is server-side: `handle_new_user` (trigger),
  `POST /api/account/acceptance`, and `recordTermsOfSaleAcceptance` — all under
  the service role. The four `profiles` columns carry no SELECT and no UPDATE
  grant (00058, pinned by db-smoke §10) and `guard_profiles_update` restores
  them; `guard_artist_profiles_insert` nulls the two agreement columns on a
  non-privileged insert (00067) and `guard_artist_profiles_update` freezes them
  (00037/00056, pinned by §15). A direct PostgREST PATCH gets 42501 before the
  trigger runs.
- **`CREATE OR REPLACE` regression sweep.** I diffed the latest body of
  `guard_profiles_update` (00058) against 00052 and 00009, of
  `guard_artist_profiles_update` (00056) against 00037 and 00030, and of
  `guard_listings_update` (00069) against 00067 and 00065. Every one is a strict
  superset of its predecessor — the 00063 class of revert has not recurred.
- **The `documents` array.** `route.ts:78-98` filters the client's list against
  `DOCUMENT_NAMES` and then intersects it with what `outstandingAcceptances`
  actually returns, so it can only ever narrow; every version comes from
  `STAMPS`, never from the body.
- **Fail-open vs fail-closed.** The GET catches and returns `{blocks:false}`;
  the POST returns 503 on the same failure; the gate does not catch. The GET is
  read-only and nothing downstream trusts its answer for authorisation, so it
  cannot be used to bypass the gate — the gate does its own lookup with its own
  service-role client on every call.
- **`order_returns` RLS.** The policy is `is_privileged() OR EXISTS(orders o
  WHERE o.id = order_id AND (o.buyer_id = auth.uid() OR EXISTS(artist_profiles
  ap WHERE ap.id = o.artist_id AND ap.profile_id = auth.uid())))`, with
  `REVOKE ALL … GRANT SELECT TO authenticated`. Policy sub-selects run as the
  caller, so they can only narrow further, and both `orders` SELECT policies and
  00036's `artist_profiles` policy (which keeps the owner's own row readable
  even when not live) make the two legitimate readers work. An embedded join in
  either direction (`orders?select=*,order_returns(*)` or the reverse) still
  evaluates each table's own RLS, and there is no SECURITY DEFINER view or RPC
  over the table. db-smoke §14 asserts it under a real `SET ROLE`.
- **"Revealed only after authorisation".** The RLS policy has no `authorized_at`
  condition, but there is no state it needs one for: `authorizeReturn` is the
  only writer of `return_address` and writes it in the same upsert as
  `authorized_at`. The buyer's card additionally guards on
  `ret?.authorized_at && ret.required && !ret.waived_at`
  (`orders/page.tsx:383`).
- **IDOR on the seven new routes.** `return-shipped` — `order.buyer_id !==
  user.id` → 403, CAS `authorized_at IS NOT NULL AND shipped_back_at IS NULL`.
  `cancel-unshipped` — buyer or artist by explicit comparison, plus a pickup
  refusal and a window check for the buyer; CAS inside `settleRefund`.
  `propose-ship-by` — artist only, CAS `status='paid' AND shipped_at IS NULL`.
  `accept-ship-by` — buyer only, same CAS. `concede-dispute` — artist only, CAS
  `dispute_conceded_at IS NULL`. `admin/.../signature-confirmed` and
  `admin/.../return` — `profiles.role = 'admin'` from the caller's session
  before anything else; the former CASes on `signature_confirmed = false`. The
  four user-facing reads go through the session client, so a stranger's order id
  returns no row and 404s before the ownership comparison is even reached.
- **DMCA removal cannot be undone by the artist.** By status: the guard raises
  on any `status` change while `dmca_removed_at` is set. By clearing the stamp:
  `NEW.dmca_removed_at := OLD.dmca_removed_at`, likewise `pre_dmca_status` and
  `dmca_quarantined_paths` (00069). By another edit: other columns are editable
  but the listing stays `hidden`, so nothing is republished. By delete:
  `guard_listings_delete` raises (00067), and the notice's FK is `ON DELETE
  RESTRICT` so even a privileged delete cannot orphan the record. db-smoke §13
  asserts all four.
- **Non-admin reading the notice file.** `dmca_notices` has RLS `FOR ALL USING
  (is_privileged())` and `REVOKE ALL FROM anon, authenticated` (db-smoke §13
  checks the grant catalogue). `dmca_substantiated_count` is revoked from
  PUBLIC as well as the two roles (00068, re-asserted in 00069, and §16 now
  checks the whole class). The `dmca-quarantine` bucket is private with no
  `storage.objects` policy naming it, and 00056 dropped the last unconditional
  SELECT policies, so no browser role can read a quarantined file.
- **Ruling D8 is a content filter, nothing more, and nobody in this codebase
  treats it as access control.** The preference lives in `localStorage`, the
  listing page stays reachable behind `MatureGate` (a client-side render
  branch), sitemaps still include mature listings, and no route, policy or
  guard consults `is_mature`. The two shelf queries that filter on an embedded
  column (`featured.ts:18`, `partnerPicks.ts:29`) both use `listings!inner`, so
  the filter really does drop the parent row rather than nulling the embed.
- **Possession, at the three sites that decide it.** The return gate
  (`settleRefund.ts:150`) and `authorizeReturn` (`orderReturns.ts:61`) both ask
  `buyerTookPossession || pickupPossessionUnknown`; both relist sites
  (`settleRefund.ts:232`, `webhooks/stripe/route.ts:523`) ask
  `pieceIsWithArtist`. `orderReturns.test.ts:246-252` asserts the partition over
  the enumerated state space. The only caller still deciding independently is
  `approve-refund`'s `piece_not_collected`, which is the P1 above.
- **Remaining `shipped_at` readers are all shipping questions, not possession
  questions.** `fulfillmentWindow.missed`, `cancel-unshipped`,
  `propose-ship-by` and `accept-ship-by` all key on `shipped_at` — and all four
  are unreachable for pickup orders: the cron filters `.eq('is_pickup', false)`,
  `settleRefund`'s `requireUnshipped` refuses pickup outright, `cancel-unshipped`
  409s on `is_pickup`, and both order cards wrap the window UI in
  `!order.is_pickup`. `disputeOutcome.restoredStatus` reads `shipped_at` only
  after `pre_dispute_status`, which 00050 stamps.
- **`confirm-pickup`** stamps only the caller's own column under the service
  role with `.is(column, null)`, and both columns are frozen for non-privileged
  writers in every `guard_orders_update` body from 00042 to 00066 — an artist
  cannot manufacture the buyer's confirmation. (That the artist's *own*
  confirmation alone now implies possession is ruling D7/r7's deliberate choice,
  and its worst case is a return an admin can waive.)
- **Gate placement.** All 13 routes call `acceptanceGateFor` immediately after
  the 401 and before any read, parse or write. No gated route does work first.
- **`is_privileged()`** (00052) no longer treats "no JWT" as trusted for
  PostgREST traffic — an anon request carries the anon key's claims, so only
  psql/GoTrue/cron and the service role take that branch.
