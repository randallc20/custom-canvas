# Accounts, auth & access control — review 2026-09-03 (r7)

**Files read (opened in full unless noted):**

- `docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (D1–D13)
- `docs/reviews/01-auth-access-r2.md` … `-r6.md` and `04-money-r5.md` … `-r8.md` — finding
  headings across all of them, the full bodies of `01-auth-access-r6.md` and every r5–r8
  finding touching acceptance, possession, returns and DMCA
- `git log --oneline -12`, `git log --stat -4`, and the full diffs of `8d3d347` and `ef365e9`
  for the files in scope
- `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`, `src/services/acceptance.ts`,
  `src/components/legal/AcceptanceInterstitial.tsx`, `src/app/(auth)/register/page.tsx` (checkbox only)
- All 13 `acceptanceGateFor` call sites, read at the head: `api/payments/checkout`,
  `api/listings` (POST), `api/listings/[id]` (PATCH, plus its DELETE), `api/messages`,
  `api/reviews`, `api/commissions` (POST), and
  `api/commissions/[id]/{accept,decline,confirm,complete,updates,dispute,withdraw-dispute}`
- The seven new order routes: `api/orders/[id]/{return-shipped,cancel-unshipped,propose-ship-by,accept-ship-by,concede-dispute}`
  and `api/admin/orders/[id]/{signature-confirmed,return}`; plus `approve-refund`,
  `confirm-pickup` and `api/admin/orders/[id]/refund` as their callers
- `src/lib/settleRefund.ts`, `src/lib/orderReturns.ts`, `src/utils/orderReturns.ts`,
  `src/utils/fulfillment.ts`, `src/utils/disputeOutcome.ts` (`restoredStatus`),
  `src/lib/orderThread.ts`, `src/hooks/useOrderReturn.ts`,
  `src/app/api/cron/fulfillment-windows/route.ts`,
  `src/app/api/webhooks/stripe/route.ts` (the `charge.refunded` branch, 485–595)
- `src/app/admin/orders/page.tsx` (return + signature controls, the new authorize modal),
  `src/components/studio/SalesSection.tsx` (possession + refund modal),
  `src/app/(user)/orders/page.tsx` (the return block)
- `src/app/api/admin/dmca/route.ts`, `src/app/admin/dmca/page.tsx`
- `src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`,
  `src/components/listing/MatureGate.tsx`, `src/components/artist/SeriesTabs.tsx`,
  `src/components/feed/RecentlyViewed.tsx`, `src/services/{feed,featured,partnerPicks,artists}.ts`,
  `src/hooks/{useFeed,useFeatured,usePartnerPicks,useArtist}.ts`
- `src/services/{listings,orders,artistContent}.ts` for the client-side-write sweep
- Migrations `00058`, `00063`, `00064`, `00065`, `00067`, `00068`, `00069`; and for the guard
  chains they restate, `00001`, `00009`, `00030`, `00032`, `00033`, `00037`, `00052`, `00056`
- `scripts/db-smoke.sql` §10–15

**Skipped:** nothing in the stated scope. I did not re-derive the refund arithmetic
(`calculateRefundSplit`, `evaluateProtection`) beyond what the possession predicate needed —
that is the money pass's ground.

**Verdict:** The acceptance record is genuinely closed: I traced every writer of
`profiles.terms_*` and `artist_profiles.agreement_*` and could not construct a forgery from any
client role, the `documents` array only narrows, and the fail-open/fail-closed split now does
what its docstrings claim after the r6 fix. The weakness this round is the same one for the
fifth round running — *local pickup* — but it has moved: `buyerTookPossession()` is now used at
both relist sites, and it is the **wrong half** of the predicate. The return gate answers "does
the buyer have the piece" with `buyerTookPossession(order) || pickupPossessionUnknown(order)`;
the two relist sites answer it with `buyerTookPossession(order)` alone, so for the one state
the last two rounds were spent creating — a pickup order nobody confirmed — the two halves of
the same fix still disagree, and the painting goes back on sale. The DMCA machinery has the
mirror-image problem: the r6 P1 fix was applied to `withdraw`/`defective` and not to `restore`,
which the report that produced it named in the same sentence.

---

### P0 — The relist sites and the return gate still disagree about local pickup: a refund on a pickup order nobody confirmed puts the piece back on sale while the buyer has it

**Where:** `src/lib/settleRefund.ts:227` (and the read at `:62-68`); the same decision again at
`src/app/api/webhooks/stripe/route.ts:522-526`. The predicate itself at
`src/utils/fulfillment.ts:21-44` and `:52-66`; the other half of the answer at
`src/app/api/orders/[id]/approve-refund/route.ts:61-63` and `src/lib/orderReturns.ts:57-62`.

**What happens:**

A buyer buys a local-pickup piece. Checkout marks the listing `sold`
(`webhooks/stripe/route.ts:63`) and the order sits at `paid`, `is_pickup = true`, `shipped_at`
NULL. The buyer collects it at the studio and **neither party taps "Confirm pickup handoff"** —
the state the r7 money pass established is the common one, and the state
`pickupPossessionUnknown()` was written for.

The buyer emails support: the frame arrived cracked. An admin opens `/admin/orders`, clicks
Refund and picks reason `damaged`. `isFaultRefund('damaged')` is true
(`utils/refundSplit.ts:55-57`), so no artist approval is needed. No `order_returns` row exists
— only `approve-refund` and an explicit admin "Require a return…" ever create one — so
`returnBlocksSettlement(null)` returns `null` and the gate passes. Stripe refunds, the payout is
reversed, the order closes.

Then line 227:

```ts
const wasShipped = buyerTookPossession(order);
```

`buyerTookPossession` is `shipped_at` (null) → `is_pickup` (true, so it does not bail) →
`status === 'delivered' || artist_confirmed || buyer_confirmed`, all three false. So
`wasShipped` is **false**, the "no other live order" count is zero (the only order is now
`refunded`), and line 264 sets the listing back to `status: 'available', sold_price_cents:
null`. The painting is for sale on Custom Canvas while it hangs on the buyer's wall. The next
collector pays for a piece the artist does not have; nothing stops that order, because
`orders_one_live_per_listing` only counts live ones.

The change-of-mind arm reaches the same place with the artist's own answer overruled. Same
order, buyer asks the artist for a refund. The Studio modal shows the "The buyer never collected
this piece" checkbox (`SalesSection.tsx:469`), the artist leaves it unticked — *they did collect
it* — and `approve-refund:61-63` computes `needsReturn = buyerTookPossession(order) ||
(pickupPossessionUnknown(order) && !piece_not_collected)` = **true**. An `order_returns` row is
written with `required: true`, the address, and a seven-day clock. The buyer never sends it
back; an admin clicks "Waive return" (`admin/orders/page.tsx:345`, one click, records
`unnecessary`). `returnBlocksSettlement` now returns null because `waived_at` is set, the settle
proceeds — and line 227 says the buyer never had the piece and relists it. The system recorded
the artist saying "yes, they took it" ninety seconds earlier and then contradicted itself.

The `charge.refunded` webhook is the third door, and it is the runbook's own path (a refund
issued from the Stripe dashboard). Its `wasShipped` at `:522` is `buyerTookPossession(order) ||
delivered_at || pre_dispute_status in (shipped, delivered)` — every one of which is false for an
unconfirmed pickup order.

**Why it's real:** I went after every innocent explanation.

- *This is the r6 P0 and it is fixed.* It is the sibling state, and the r6 report's own fix
  direction named it: "Because `pickupPossessionUnknown` is a real state here too, the safe
  default for a pickup order nobody confirmed is *not* to relist and to raise it for a human."
  The fix converted both sites to `buyerTookPossession()` and stopped there. The commit message
  claims "the same predicate the return gate uses, so the two cannot disagree about the same
  fact" — but the return gate does not use that predicate alone. It uses
  `buyerTookPossession(order) || pickupPossessionUnknown(order)` (`lib/orderReturns.ts:61`,
  mirrored at `approve-refund:62`). Those two expressions differ on exactly one input: an
  unconfirmed pickup order. That input is the whole subject of the last two P0s.
- *`requireUnshipped` refuses pickup.* It does (`settleRefund.ts:89-96`), but only the buyer's
  cancel path and the cron set that flag. The admin refund route does not, and the
  `charge.refunded` webhook does not go through `settleRefund` at all.
- *The return gate stops it.* Only when a row exists, is `required`, and is neither waived nor
  accepted on inspection. The fault path creates no row; the change-of-mind path's row is
  waivable in one click, and waiving means the buyer keeps the piece — the one case where
  relisting is most wrong.
- *A return that was received and accepted should relist.* Agreed, and that case works by
  accident here. But the decision is being made from possession-at-refund-time and not from the
  return outcome at all, so it gets the right answer for the wrong reason on that branch and the
  wrong answer on the waive branch.
- *`.eq('status', 'sold')` saves it.* No: the listing is `sold` from checkout and nothing has
  moved it.

**Fix direction:** Both relist sites should ask the same question the return gate asks —
`buyerTookPossession(order) || pickupPossessionUnknown(order)` — which for a pickup order is
always true, i.e. never auto-relist a pickup piece and log it for a human, exactly as r6
directed; the artist can relist from Studio when the piece really is still theirs. Better still,
make the relist consult the `order_returns` row `settleRefund` has already read fifty lines
earlier: a `required` return that was **waived** means the buyer kept the piece and must never
relist, and one `accepted` on inspection means the artist has it back and should.

---

### P1 — DMCA `restore` has no "other live notices" check, so a successful counter-notice on one claim republishes material a different, still-substantiated notice took down

**Where:** `src/app/api/admin/dmca/route.ts:329-397` (the `restore` branch); the check that
exists thirty lines below it at `:419-440`; the card that reaches both at
`src/app/admin/dmca/page.tsx:241` and `:273-278`

**What happens:**

Two claimants, A and B, file about the same listing (or one claimant refiles after a defective
first attempt). The admin logs both — two rows, both `received`, same `listing_id`. "Remove
material" renders on each, because the button is keyed on that notice's own status
(`page.tsx:241-252`). The admin actions A: the listing is hidden and stamped, the images are
quarantined, A → `material_removed`. The admin actions B: the listing is already down, the
quarantine merge is a correct no-op after the r6 fix, B → `material_removed`.

The artist counter-notices claim B. The admin records "Counter-notice received"
(B → `counter_received`, `counter_received_at` stamped), waits the ten business days, confirms
no court action has landed and clicks **Restore** on B.

The restore branch reads `notice` and the listing row and nothing else. It restores every
quarantined image into the public `listing-images` bucket (`:373-374`), then clears
`dmca_removed_at`, `pre_dmca_status` and `dmca_quarantined_paths` and sets the listing back to
`pre_dmca_status` — typically `available` (`:376-384`). Notice A is untouched. It is a valid,
substantiated notice that Custom Canvas told claimant A it had acted on; it still reads
"Material removed" on the admin page, still counts toward the repeat-infringer number, and the
material it complained about is public again. Nothing warns the admin, and nothing in the log
records that A's removal was undone.

There is a second path that needs no double removal at all. The create form has a Kind dropdown,
and `POST` handles it (`:216`): a counter-notice can be logged as its own row, created at status
`counter_received`. If that row carries the same `listing_id`, its card renders Restore
(`page.tsx:273`). Ten business days after it was *logged* (`from` falls back to `received_at` at
`:333`), Restore on it undoes the removal while the original notice sits at `material_removed`
for ever.

**Why it's real:** I read the whole branch. There is no query for other notices anywhere between
`:329` and `:397` — the only such query in the file is the one the r6 fix added to the
withdraw/defective branch at `:419-425`, and the r6 report's fix direction for that finding ends
"The same check belongs on `restore`." Disproof attempts: (a) *the second removal is
unreachable* — no, the button's condition is `n.status === 'received'` on that row and a second
notice is a distinct row; (b) *`restore` refuses a notice that was not the one that removed the
material* — it never reads `notice.status` at all; (c) *notice A would be re-actioned* —
nothing re-runs a removal, and A's card in `material_removed` offers only counter-notice,
withdrawn and defective, none of which re-hide anything.

**Fix direction:** Run the same count the withdraw/defective branch runs — other `kind = 'notice'`
rows on this `listing_id` in `received` / `material_removed` / `counter_received`, excluding this
id — before touching the listing; when any remain, stamp `restored` on this notice, leave the
listing down and its images quarantined, and say so in the response the way the sibling branch
does. The restore branch should also refuse a notice whose own status is not
`counter_received`.

---

### P2 — On a second removal against the same listing, the DMCA route tells the admin the work is still publicly reachable when it was taken down an hour ago, and fires an error-level Sentry saying so

**Where:** `src/app/api/admin/dmca/route.ts:288-326`, with `quarantineImages` at `:72-109`

**What happens:**

The second "Remove material" on a listing calls `quarantineImages` again. It reads
`listing_images` — whose rows nothing in this flow ever deletes — so `expected` is still 3. For
each row it calls `admin.storage.from('listing-images').download(path)`, which now fails,
because the object was moved into `dmca-quarantine` by the first removal. Every iteration
`continue`s, `moved` is `[]`, and:

```ts
const incomplete = moved.length < expected;   // 0 < 3 → true
```

Three `captureException`s fire from inside `quarantineImages`, then an **error-level**
`captureMessage`: *"quarantined 0 of 3 images — the rest are STILL PUBLIC"*, and the admin is
toasted *"Only 0 of 3 images could be taken down. The rest are still publicly reachable — check
Sentry and remove them by hand before responding to the claimant."* Every word of that is false;
those files were removed from the public bucket by the first removal and are sitting in
`dmca-quarantine`. The admin's next move, per the message they were just given, is to go hunting
for public objects that do not exist before answering a claimant — on the exact workflow where
the platform's §512 position depends on knowing what was actually taken down.

**Why it's real:** the r6 P1 write-up named this behaviour in its second half, and the fix that
landed changed only the `dmca_quarantined_paths` write from replace to merge (`:293-303`);
`expected` and `incomplete` are unchanged and still computed from the `listing_images` row count
rather than from what is still public. The path is the same one P1 above uses, so it is reachable
whenever two notices name one listing. I checked whether the honest-reporting logic might be
skipped on a listing already under removal — it is not; there is no `dmca_removed_at` short-
circuit anywhere in the branch. This is a P2 rather than a P1 because it misleads rather than
loses anything: the material really is down.

**Fix direction:** `expected` should count only the images still resolvable in `listing-images`
— or, more simply, `remove_material` on a listing whose `dmca_removed_at` is already set has
nothing to quarantine and should skip the whole block and report the merged path set instead.

---

## Appendix: minor

- `settleRefund`'s possession check dropped belts the webhook's kept. The old test was
  `status === 'shipped' || 'delivered'`; the new one is `buyerTookPossession(order)`, which for a
  **non**-pickup order is `shipped_at` alone — it never reaches the `status === 'delivered'` arm,
  because `if (!order.is_pickup) return false` comes first (`utils/fulfillment.ts:29`). The
  webhook's equivalent kept `|| delivered_at || pre_dispute_status`. Only legacy rows predating
  00050's `shipped_at` stamp can hit the gap, so it is not live today, but the two sites now give
  different answers to identical input — the opposite of the fix's stated goal.
- `admin/dmca` cards for `withdrawn`/`defective` say *"Not substantiated — the listing and its
  images were restored"* unconditionally (`page.tsx:269-273`). Since the r6 fix that is false
  whenever another live notice stood; the truth is in the transient toast only, and the card is
  what the admin sees on every later visit.
- `POST /api/admin/orders/[id]/return` has no CAS on either the `receive` or the `waive` action
  (`route.ts:78-118`): re-clicking "Waive return" or "Accept inspection" moves `waived_at` /
  `received_at`, which are the timestamps a §5 dispute would be argued from. Every other new route
  in this arc CASes.
- `waive` is checked before `inspection_outcome === 'rejected'` in `returnBlocksSettlement`
  (`utils/orderReturns.ts:96` vs `:99`), so waiving overrides a failed inspection. Defensible as
  an admin's deliberate act, but the "a rejected inspection is a support conversation" rule in
  DECISIONS has no code enforcing it.
- `RecentlyViewed` (`components/feed/RecentlyViewed.tsx:35-39`) is the one home shelf with no
  `is_mature` filter. Only reachable by someone who opted in (MatureGate's only button sets the
  global preference), but D8 puts the account-page toggle there precisely so people can turn it
  back off — and after they do, the shelf still shows them the mature piece they viewed.
- 00058's header says writes go through `POST /api/account/accept-terms`; the route is
  `/api/account/acceptance`. The migration is the document someone reads before touching the
  freeze.
- Carried over from r6's appendix and still true: `restore` returns `images_restored: 0`
  unconditionally (`:393`); `undoRemoval` does not assert affected rows (`:164-171`);
  `MatureContext.ready` has no consumers; `propose-ship-by` and `accept-ship-by` still accept
  pickup orders at the route while `SalesSection` hides the control. That last one is the same
  UI-hides-it/route-allows-it shape the P0 above is made of.

## Not findings

Things I went at hard and concluded are sound:

- **Forging acceptance.** Every writer of `profiles.terms_*`: `handle_new_user` (trigger),
  `POST /api/account/acceptance` (service role), `recordTermsOfSaleAcceptance` (service role).
  Every writer of `artist_profiles.agreement_*`: the acceptance POST, and 00037's one-time
  backfill to `1.0`. A direct PostgREST write is refused twice over: the column-level grant is
  `full_name, avatar_url, email_preferences` only (00052:111), which is a *role* grant so an
  admin's own session is refused too, and `guard_profiles_update` (00058) restores all four
  columns for any non-privileged writer. On the artist side, `guard_artist_profiles_insert`
  (00067) nulls both at INSERT — including through an upsert, whose conflict path fires the
  UPDATE guard (00056) instead — so delete-and-reinsert loses the stamp rather than forging one.
  db-smoke §10, §12 and §15 pin all of it behaviourally. No forgery path exists.
- **The `documents` array only narrows.** `requested` is filtered against a literal allowlist,
  then used as `all.filter(o => requested.includes(o.document))` where `all` is the server's own
  outstanding set. A document that is not outstanding cannot be added; `[]` stamps nothing;
  malformed JSON degrades to "accept everything outstanding", which is the interstitial's own
  semantic. No version ever comes from the client — `STAMPS` reads `src/lib/agreement.ts`.
- **The signup trigger.** 00063 keeps 00023's role sanitiser, schema-qualifies everything, and
  stamps the Terms of Service but deliberately not the Terms of Sale. I checked whether the
  unconditional stamp could record an acceptance nobody gave: the only signup surface in the app
  is `(auth)/register`, which will not submit without the D12 checkbox
  (`register/page.tsx:36,163-169`), and there is no OAuth, magic-link or invite path anywhere
  (`grep` for `signInWithOAuth`/`signInWithOtp` returns nothing). So "an account existing IS that
  acceptance" holds today. It stops holding the day a social login ships, and 00063 should carry
  that warning.
- **Gate placement, all 13.** Every one calls `acceptanceGateFor` on the line after the 401 and
  before any read, parse or write. I read the head of each. None does work first.
- **Fail-open vs fail-closed.** `outstandingAcceptances` now throws on either query error
  (`acceptance.ts:100,121`). `GET` catches and returns `{ outstanding: [], blocks: false }` —
  open, and it only decides whether the modal and banner render. The POST catches separately and
  returns 503 rather than a 200 that lies. `acceptanceGate` does **not** catch, and no gated route
  wraps the call, so a lookup failure propagates and Next returns a 500 — refused, which is the
  promise the docstring makes and the r3 P2 it finally closes. The open half cannot be used to
  bypass the closed half: no route consults the GET, `fetchAcceptance` only feeds the
  interstitial, and a client that forces the GET to fail (or never calls it) still gets the 403.
- **IDOR on the seven new routes.** `return-shipped` → `order.buyer_id !== user.id` → 403, then
  CAS on `authorized_at IS NOT NULL AND shipped_back_at IS NULL`. `cancel-unshipped` → `isBuyer
  || isArtist` → 403, then a pickup refusal and a window check that applies only to the buyer.
  `propose-ship-by` → `artist.profile_id !== user.id` → 403, CAS on `status='paid' AND shipped_at
  IS NULL`. `accept-ship-by` → `buyer_id !== user.id` → 403, same CAS. `concede-dispute` →
  `artist.profile_id !== user.id` → 403, CAS on `dispute_conceded_at IS NULL`.
  `admin/signature-confirmed` and `admin/return` → `profiles.role !== 'admin'` → 403, and the
  first CASes on `signature_confirmed = false`. All five user-facing routes read the order
  through the caller's RLS-scoped client, so another account's order id 404s before the 403 is
  reached. Nothing here IDORs.
- **`order_returns` RLS.** `is_privileged() OR EXISTS(orders o WHERE o.id = order_id AND
  (o.buyer_id = auth.uid() OR EXISTS(artist_profiles ap WHERE ap.id = o.artist_id AND
  ap.profile_id = auth.uid())))`, with `REVOKE ALL FROM anon, authenticated` and only `SELECT`
  granted back to `authenticated`. anon holds no grant at all, so the postal address is
  unreachable without a session — and `is_privileged()` since 00052 keys on the JWT claims rather
  than 00009's `auth.uid() IS NULL`, so an anon-key request is not privileged either. An embedded
  read (`orders?select=*,order_returns(*)`) evaluates the embedded table's own policy and buys
  nothing; there is no table with a looser policy that owns a FK into it. db-smoke §14 asserts
  buyer, artist and outsider under `SET ROLE authenticated` — the vacuous-pass trap is closed
  there — and that the buyer cannot write their own waiver. The buyer's Orders page gates the
  address render on `ret.authorized_at` (`orders/page.tsx:383`), and `authorizeReturn` is the only
  writer of `return_address` and always stamps `authorized_at` with it, so "revealed only after
  authorisation" holds. `postOrderSystemMessage` finds the thread by the *participant pair*, so
  the address cannot land in another artist's conversation.
- **Reading the DMCA file.** `REVOKE ALL ON dmca_notices FROM anon, authenticated` plus one
  `FOR ALL USING (is_privileged())` policy; `/api/admin/dmca` gates on `profiles.role === 'admin'`
  on every verb through `requireAdmin()`. 00068 fixed the missing `REVOKE ... FROM PUBLIC` on
  `dmca_substantiated_count`, 00069 restates both revokes, and db-smoke §13 asserts no
  client-role grant exists at all.
- **Getting a removed listing back.** By status: `guard_listings_update` (00069, restated cleanly
  from 00067 with one added line) raises. By clearing the stamp: the trigger restores
  `dmca_removed_at`, `pre_dmca_status` and now `dmca_quarantined_paths` from OLD. By deleting:
  `guard_listings_delete` (00067) raises and the FK is `ON DELETE RESTRICT`. By editing other
  columns: possible, but the status freeze keeps it hidden. I also diffed all three guard-chain
  restatements in this arc against their predecessors (00058 vs 00052, 00067 vs 00032, 00069 vs
  00067) for the 00063-style silent revert — each is the previous body plus its marked additions,
  nothing dropped. The only remaining way back is r6's open storage P2 (re-uploading to the
  quarantined path), which 00069 does not touch.
- **Ruling D8 is treated as a content filter, not access control.** `is_mature` is a query
  predicate in `services/feed.ts:93,202`, `featured.ts:18`, `partnerPicks.ts:29` and a client-side
  filter in `SeriesTabs.tsx:35`; the featured and partner shelves use `!inner` so the embedded
  filter really excludes rather than nulling. The listing page stays reachable behind
  `MatureGate`'s click-through, the preference is `localStorage` only, it is correctly absent
  from the feed's URL filters, and no server route branches on it. Nothing anywhere treats it
  as a permission. `getArtistListings` returns mature rows to the browser and lets `SeriesTabs`
  filter them — correct for a content filter, and not a leak given a public image bucket.
- **A gated action reachable another way.** Both I found are already on file and neither was made
  worse: listing images are written client-side and never pass the PATCH gate (r5 P3), and
  `messages`/`reviews` still accept client inserts under RLS with the gate living only in the
  route (r3 P2). I re-swept every write in `src/services`: the only direct `listings` write is
  `deleteSeries` clearing `series_id`, `updateOrderStatus` writes `orders.status` under the 00050
  transition guard (not one of D11's gated actions), and there is no client-side insert to
  `messages`, `reviews` or `commissions`. `DELETE /api/listings/[id]` is ungated, but D11 names
  listing *create and edit*, not delete.
- **The acceptance 403 versus the fulfilment-window cron.** I chased whether an artist blocked
  from `/api/messages` by a stale acceptance could be auto-cancelled for "going silent". They
  cannot in practice: `proposed_ship_by` counts as engagement and that route is ungated, the
  nudge notification tells them to ship or propose from Studio, `artistSpokeSince` fails lenient
  on a read error, and the 403 carries a message pointing at the banner. Worth knowing the two
  systems do not know about each other, but not a defect.
