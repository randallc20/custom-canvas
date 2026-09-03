# Money & order lifecycle — review r11 (legal-alignment arc) — 2026-09-03

**Files read:** `git log -p -3` in full (`f875d61`, `474e094`, `1ebb6b9`); at HEAD —
`src/lib/settleRefund.ts` (three passes), `src/lib/settleRefund.test.ts`,
`src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`, `src/lib/assessProtection.ts`,
`src/lib/acceptance.ts`, `src/utils/orderReturns.ts`, `src/utils/refundSplit.ts`,
`src/utils/fulfillment.ts`, `src/utils/fulfillmentWindow.ts`, `src/utils/reconcileStripe.ts`,
`src/utils/disputeOutcome.ts` (the two predicates settleRefund's ids feed),
`src/app/api/orders/[id]/cancel-unshipped/route.ts`, `.../approve-refund/route.ts`,
`.../accept-ship-by/route.ts`, `.../propose-ship-by/route.ts`, `.../return-shipped/route.ts`,
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../return/route.ts`,
`.../signature-confirmed/route.ts`, `src/app/api/cron/fulfillment-windows/route.ts` (twice),
`src/app/api/webhooks/stripe/route.ts` (`checkout.session.completed`'s oversell refund,
`charge.refunded`, `charge.dispute.created/updated`, `charge.dispute.closed`),
`src/components/studio/SalesSection.tsx`, `src/app/(user)/orders/page.tsx`,
`src/app/admin/orders/page.tsx` (the settle modal and its gating only),
`src/services/orders.ts`, `src/services/messages.ts`, all thirteen `acceptanceGateFor` call sites,
`supabase/migrations/00061_refund_reasons.sql`, `scripts/db-smoke.sql` §6 and §14,
`docs/CONVENTIONS.md`, `README.md`, `docs/POST-LAUNCH-BACKLOG.md`, and
`docs/reviews/04-money-r5.md` … `-r10.md` plus `01-auth-access-r3.md` … `-r8.md` by heading.
`src/utils/evaluateProtection.ts` was read only for `addBusinessDays` /
`businessDaysBetween` / `SIGNATURE_REQUIRED_FROM_CENTS`, because nothing in `f875d61`
touches protection scoring and r7/r9/r10 covered it.

**Verdict:** Four of the five fixes are sound; the fifth — "look before you create" — is a
new P0. It adopts *any* Stripe refund on the payment intent without checking its amount, its
status or whose it is, and then closes the order as fully refunded, reverses the artist's
entire payout and relists the piece; the daily reconcile cron is structurally unable to see
the shortfall. The arc's own pattern holds for a sixth round: the P0 was produced by a fix,
not by the original build.

---

### P0 — `settleRefund` adopts *any* refund on the payment intent, so a partial or failed refund closes the order as fully refunded, reverses the artist's whole payout and relists the piece

**Where:** `src/lib/settleRefund.ts:239-254` (and the reversal twin at `:293-300`);
consequences at `:281-311`, `:334-346`, `:354-392`, `:394-400`;
detection gap at `src/utils/reconcileStripe.ts:85,100-105` and
`src/app/api/webhooks/stripe/route.ts:490`.

**What happens:** the block runs on *every* first settle, not only on a retry — `refundId`
is seeded from `order.stripe_refund_id`, which is null on a fresh order, so `!refundId` is
true and the list call happens. It takes `existing.data[0]` with no test of the refund's
`amount`, no test of its `status`, and no test of `metadata.order_id` (that field is read at
`:250`, but only to decorate a Sentry string). Two concrete paths:

*Path 1 — a hand-issued partial refund.* Support refunds $25 of a $521.06 order in the
Stripe Dashboard as a goodwill gesture for a late shipment. `charge.refunded` fires;
`webhooks/stripe:490` breaks immediately because `amount_refunded < amount`, so the order
stays `paid` and nothing on it records the $25. A week later the artist approves a refund and
an admin settles it. `settleRefund` lists the refunds, finds the $25 one, writes its id into
`stripe_refund_id`, and — because `refundId` is now set — **never calls
`stripe.refunds.create`**. It then reverses `order.artist_payout_cents` in full at `:302-307`,
closes the order `refunded` at `:334`, relists the listing at `:368-374`, and returns
`refundedCents: refundAmount` — the full computed figure. The admin's screen says the buyer
got $521.06 back; the buyer got $25. The artist lost 100% of their payout. The platform holds
the difference. Through `cancelUnshipped` the same value is formatted into the buyer's
"cancelled and refunded in full (…)" email and into the order thread.

*Path 2 — our own refund, re-settled under a different reason.* An admin settles
`change_of_mind` on a $521.06 order: `refunds.create` succeeds at Stripe for $505 (the fee and
its tax retained), but the response is lost to a timeout, so `:277` never runs and the catch
at `:312` answers "Refund failed at Stripe — safe to retry." The admin reopens the modal,
decides the piece was in fact `not_as_described`, and settles again. `moneyHasMoved` is
**false** (the row never learned the refund id), so the mismatch guard at `:178` — the one
`f875d61` added for exactly this — does not fire. The reason write at `:200` unconditionally
stamps `not_as_described`. The list call then adopts the $505 refund and skips the create. The
order closes with `refund_reason = 'not_as_described'`, the buyer's Orders page renders
"Refunded in full — the piece was not as described" (`orders/page.tsx:247`), and the buyer is
$16.06 short with no record anywhere that says so.

**Why it's real:** I looked for something downstream that would catch it and there is nothing.
`charge.refunded` is the obvious candidate and it is guarded by
`if (charge.amount_refunded < charge.amount) break;` (`:490`) — a partial refund never reaches
the transfer-shortfall alert at `:529-555`. The daily reconcile cron is the other candidate,
and `reconcileStripe.ts:85` defines `stripeRefunded = charge.refunded || charge.amount_refunded > 0`,
so "order refunded, charge partially refunded" produces **no** mismatch —
`order_refunded_stripe_not_refunded` at `:100` only fires when *nothing* was refunded. The
only trace is a `Sentry.captureMessage(..., 'info')` at `:248`, and in Path 2 its
`metadata.order_id` check passes, so it does not even carry the
"(not created by this platform)" suffix. Nothing in `settleRefund` compares the adopted
refund against `refundAmount`, which it has computed two lines earlier at `:187`. The commit
message names the dangerous input directly — "including one issued by hand in the Dashboard" —
so Path 1 is invited by design, not stumbled into. The sibling code in the same repo does the
arithmetic properly: `webhooks/stripe:936-945` retrieves the transfer and compares
`amount_reversed` against `transfer.amount` before deciding.

**Fix direction:** adopt only a refund that can actually stand in for the one about to be
created — `status === 'succeeded'` and `amount === refundAmount` (or, more permissively,
`metadata.order_id === order.id`) — and scan `existing.data` rather than taking `[0]`. When a
refund exists but does not match, refuse with a 409 naming the amount found so a human decides;
issuing nothing and reporting a full refund is the one outcome that must not be reachable.

---

### P1 — The reversal twin adopts a partial transfer reversal and reports the payout as fully reversed, so the platform silently eats the remainder

**Where:** `src/lib/settleRefund.ts:293-309` and `:398`; contrast
`src/app/api/webhooks/stripe/route.ts:936-951`; pinned wrong by
`src/lib/settleRefund.test.ts:344-360`.

**What happens:** `stripe.transfers.listReversals(transferId, { limit: 100 })` then
`priorReversals.data[0]`, with no amount check. An admin who issues a hand refund in the
Dashboard with "reverse transfer" ticked, or who reverses part of a transfer to claw back a
goodwill credit, leaves a reversal smaller than `artist_payout_cents` on that transfer. The
next settle adopts it, skips `createReversal`, and returns
`payoutReversedCents: reversalId ? order.artist_payout_cents : 0` (`:398`) — the *full*
payout, unconditionally, because the field is derived from the presence of an id rather than
from any amount. `admin/orders/[id]/refund/route.ts:61` puts that number in the response, so
the admin who just settled is told the whole payout came back. The artist keeps the
difference and the platform funds it out of its own balance.

**Why it's real:** I tried to argue the row's own `stripe_reversal_id` makes this
unreachable, and it does not — the whole point of the list call is the case where the row has
no id, and `webhooks/stripe:929-934` says in its own comment that a dashboard refund with
"reverse transfer" ticked "leaves no `stripe_reversal_id` on the row". That handler therefore
reads `transfer.amount_reversed` and compares it against `transfer.amount` before deciding
whether anything is owed; `settleRefund`'s new block does neither. The test at
`settleRefund.test.ts:344-360` stubs a reversal with no amount at all and then asserts
`payoutReversedCents` is `2200` — it pins the defect rather than catching it, which is the
failure mode the brief warns about.

**Fix direction:** retrieve the transfer and work from `amount_reversed`, as the dispute-close
handler already does: reverse only the shortfall (`artist_payout_cents - amount_reversed`),
and report the real total rather than `artist_payout_cents`. The idempotency key is already
per-order, so a genuine duplicate is still refused by Stripe.

---

### P1 — After the artist approves a refund the buyer's card still offers "Accept <new date>", and accepting it closes the buyer's own cancel right while telling the artist to ship a piece they have no button to ship

**Where:** `src/app/(user)/orders/page.tsx:311-380` (no `refund_approved_at` condition) vs
`src/components/studio/SalesSection.tsx:334` (the whole L7 block now hidden);
`src/app/api/orders/[id]/accept-ship-by/route.ts:28-67` (no `refund_approved_at` check);
`src/app/api/orders/[id]/approve-refund/route.ts:77-91` (does not clear `proposed_ship_by`).

**What happens:** the artist can't make the window, so they use "Can't ship in time" and
propose a new date. The buyer would rather have their money and says so in Messages; the
artist approves the refund. `approve-refund` writes `refund_approved_at` and leaves
`proposed_ship_by` standing. From that moment the two cards say different things about the
same order:

- the artist's card loses the entire L7 block — the ship-by sentence, the proposal state and
  both buttons — and shows only "Refund approved — Custom Canvas is settling the payment"
  (`SalesSection.tsx:438`);
- the buyer's card still renders "The artist couldn't ship within the original window and has
  proposed <date>. It's your choice: accept the new date, or cancel for a full refund"
  (`orders/page.tsx:322-328`) with an **Accept** button, immediately above "Refund approved —
  Custom Canvas is settling your payment" (`:430`).

If the buyer presses Accept, `accept-ship-by` succeeds: the order is still `paid` with a null
`shipped_at`, which is all it checks. It writes `agreed_ship_by`, clears `window_missed_at`
and `platform_nudged_at`, posts "The buyer has accepted the new ship-by date of …" into the
shared thread, and notifies the artist "New date accepted". The artist has no Mark-as-Shipped
button (`SalesSection.tsx:423`), no propose button and no cancel door (`cancel-unshipped`
409s for them). And because `fulfillmentWindow` now reads `agreed_ship_by`, `win.missed` goes
false — so the buyer has just given away the §3 cancel right that was their only self-serve
escape if the settle queue stalls. Both parties have been told, by the platform, two
incompatible things about one order.

**Why it's real:** I checked whether the proposal is torn down somewhere — it is not.
`approve-refund`'s update at `:79-87` writes three columns and no more; nothing else nulls
`proposed_ship_by`, and `accept-ship-by` selects `refund_approved_at` neither at `:30` nor in
its CAS at `:58-60`. The cron cannot rescue it either: `fulfillment-windows:68` filters
`.is('refund_approved_at', null)`, so this order is invisible to it. This is not the deferred
D13 item ("full return status on both order cards") — that is about return state; this is the
shipping promise and a live action button.

**Fix direction:** the artist's card lost more than the one button the fix was aiming at —
keep the ship-by sentence and the proposal state visible and drop only "Cancel order" — and
give the buyer's L7 block the same `!order.refund_approved_at` condition the artist's now has,
so the only thing offered there is the cancel right §3 actually grants. `accept-ship-by`
should refuse with a 409 when `refund_approved_at` is set, the way `cancel-unshipped` now does
for the artist.

---

### P2 — Two settles racing on one order now both write `refund_reason`, and the row can end up describing a split the money did not follow

**Where:** `src/lib/settleRefund.ts:200-203` (the `.is('refund_reason', null)` predicate
removed), `:178-184` (the guard that does not cover this), `:256-278`.

**What happens:** the interleaving needs one `change_of_mind` door and one fault door on the
same order, which is reachable: an admin working the settle queue on an artist-approved
refund, and the buyer clicking "Cancel for a full refund" because the window has lapsed.

1. Admin call A and buyer call B both read the order — `stripe_refund_id` null,
   `refund_reason` `change_of_mind` from the approval.
2. Both pass every gate (`moneyHasMoved` is false for both; B's `requireUnshipped` is
   satisfied; the return record from `approve-refund` is `required: false` on an unshipped
   order).
3. A writes `refund_reason = 'change_of_mind'`. B writes `refund_reason = 'not_shipped'`,
   `refund_initiated_by = 'buyer'`. Last writer wins — that is what removing the predicate
   changed.
4. Both list refunds and see nothing. A creates the refund for $505 under key `refund_<id>`
   and succeeds. B creates under the same key with `amount` $521.06; Stripe rejects an
   idempotent reuse whose parameters differ, B's catch at `:312` returns 502.
5. A persists the id, reverses, closes the order `refunded`.

The row now reads `not_shipped` over money that moved as `change_of_mind`. The buyer's Orders
page says "Refunded in full — the piece was never shipped" (`refundSplit.ts:65`) and the admin
table says the same; the buyer is $16.06 short and every screen tells them otherwise. B's
retry does not repair it: `moneyHasMoved` is now true and `order.refund_reason` equals *B's*
`opts.reason`, so the mismatch guard at `:178` passes it through, and only the top-of-function
`status === 'refunded'` check stops it.

**Why it's real:** I tried to defend the change and could not, for this interleaving
specifically. The old `.is('refund_reason', null)` predicate made both writes in step 3 no-ops
(`approve-refund:85` has already stamped `change_of_mind`), so the row kept saying
`change_of_mind` — which is what the money did. The predicate was wrong for the case r5/r9
found (a deliberate reason switch at the settle door) and right for this one; the fix swapped
which case is broken rather than closing both. The window is small — two humans within the
same second or two — which is why this is a P2 and not higher.

**Fix direction:** make the reason write part of a compare-and-swap that also claims the
settle — e.g. `.update({refund_reason, refund_initiated_by}).eq('id', …).is('stripe_refund_id', null).select('id')`
plus a settle-in-progress claim — so exactly one caller may move money on an order, and the
loser is refused before it reaches Stripe rather than after.

---

### P2 — `moneyHasMoved` reads the row, so the one failure fix 4 was written for still runs every gate

**Where:** `src/lib/settleRefund.ts:89` vs `:239-254`.

**What happens:** the flag is `!!order.stripe_refund_id`, read from the database at `:62`,
while the authority on whether money moved is Stripe — and the look-before-you-create that
asks Stripe runs *after* every gate. So the case fix 4 names in its own comment ("the refund
is at Stripe, the close failed, and the retry is turned away by a gate that has since changed
its mind") is only covered when the id write landed. When it did not — which is precisely the
window fix 3 exists for — the retry is still refused before it ever asks Stripe: the buyer
cancels an unshipped order, the refund is created, `:277` fails, the artist marks the piece
shipped, and the retry now hits `requireUnshipped` at `:97` and gets "This order has already
shipped." Buyer refunded, order `paid`, artist free to ship — the exact end state fix 4
describes. The same happens if an admin authorises a return between attempts (`:148-172`
blocks), or if the `order_returns` read merely fails (`:157` returns 503, fail-closed).

**Why it's real:** I checked whether the adoption could be reached anyway and it cannot —
every one of those gates `return`s before `getStripe()` at `:186`. And `moneyHasMoved` cannot
be true here by another route: nothing else writes `stripe_refund_id` except `:247` and `:277`
in this function. Reachability is low (a lost id write *and* a gate that flipped), which is
why it is a P2, but the fix is advertised as closing this and does not.

**Fix direction:** either resolve "has money moved" against Stripe before the gates — hoist
the `refunds.list` call above them and set `moneyHasMoved` from its result (with the amount
check P0 needs) — or accept the narrower scope and say so in the comment, which currently
claims more than the code does.

---

### P2 — `moneyHasMoved` can be true when money has not moved: a `failed` or `canceled` Stripe refund is adopted like any other

**Where:** `src/lib/settleRefund.ts:240-253`.

**What happens:** `stripe.refunds.list` has no status filter and returns refunds in every
state — `pending`, `succeeded`, `failed`, `canceled`. A refund fails when the issuing bank
rejects it (a closed card is the common cause), and the money returns to the platform balance.
That failed refund is still the newest object on the payment intent, so `data[0]` picks it up:
the id is written to `stripe_refund_id`, no new refund is created, the payout is reversed, the
order closes `refunded`, and from then on `moneyHasMoved` is true for every later call — which
turns off the approval gate, the return gate and `requireUnshipped` on an order where the
buyer has received nothing at all.

**Why it's real:** the only guard that could save it is `charge.refunded`, and Stripe does not
emit that for a refund that failed. `reconcileStripe.ts:85` reads `charge.amount_refunded`,
which a failed refund does not increase — so `orderRefunded && !stripeRefunded` at `:100`
*would* fire here, which is the one detection that works. That is why this is a P2 rather than
part of the P0: it is loud the next morning. It is the same missing check as the P0 (no
`status`, no `amount`), listed separately because the failure mode and the detection story
differ.

**Fix direction:** the same `status === 'succeeded' && amount === refundAmount` filter closes
both. A `pending` refund is the interesting middle case and should be adopted (it will settle),
but only when its amount matches.

---

## Appendix: minor

- `settleRefund.test.ts:327-342` ("adopts a hand-issued Dashboard refund rather than issuing a
  second one") stubs `{ id: 're_by_hand' }` with no amount and asserts success; `:344-360`
  asserts `payoutReversedCents === 2200` for an adopted reversal of unknown size. Both tests
  pin the P0/P1 above as intended behaviour. The rest of the file has teeth — I checked each
  assertion against the branch it claims, and the `.is()` modelling in `makeAdmin` genuinely
  distinguishes the old predicate from the new write.
- The adoption's Sentry line is `'info'`, and the "(not created by this platform)" suffix keys
  on `metadata.order_id`, so the P0's Path 2 (our own refund, wrong reason) logs nothing that
  reads as a problem. This is the only signal either path produces.
- `:247`, `:277` and `:309` are still unchecked `.update()`s with no `.select()` — unchanged
  from r9/r10's appendices, but `:247` is new in this commit and is the write the whole
  adoption design depends on.
- The reason write at `:200` now stamps `refund_reason`/`refund_initiated_by` on orders whose
  settle then failed and moved nothing. Cosmetic today — both order cards and the admin table
  gate that label on `status === 'refunded'` (`orders/page.tsx:246`, `admin/orders/page.tsx:305`)
  — but any future report reading the column will count attempts as refunds.
- On a resume the same write overwrites `refund_initiated_by` with whoever retried, so an
  artist-approved refund finished by the cron ends up recorded as `platform`.
- r10's appendix noted that `refundedCents` is computed from the caller's reason even on a
  retry that skips step 1, and called it "harmless today". Fix 3 makes it not harmless: with
  adoption it is the number that goes into the buyer's cancellation email and the order thread
  (`cancelUnshipped.ts:64,76,93`) over money that may not have moved.
- `guard_orders_update` (00061) still freezes `refund_reason`, `refund_initiated_by`,
  `stripe_refund_id` and `stripe_reversal_id` for non-privileged writers, so nothing above is
  reachable by an artist or buyer writing directly — every path runs through the service role.

## Not findings

- **The thirteen acceptance call sites.** All of them were converted to
  `NextResponse.json(gate.body, { status: gate.status })`; I grepped every one. A site left
  as `NextResponse.json(gate, { status: 403 })` would still have typechecked and would have
  shipped a body with no top-level `error`/`code`, silently killing the interstitial — none
  exists. Checkout surfaces `err.error` as a toast (`checkout/[listingId]/page.tsx:97`), so the
  new 503 sentence reaches the buyer; backlog #17 is not made worse by this fix.
- **Skipping the pickup branch of `requireUnshipped` on a resume.** Both callers of
  `cancelUnshippedOrder` already refuse pickup orders before they get there
  (`cancel-unshipped/route.ts:44`, `fulfillment-windows:62`), so the r6 P0 is not reopened by
  the skip — the branch is belt-and-braces on a door that is already shut.
- **Skipping the approval gate on a resume as a privilege escalation.** It cannot be: the only
  door that can pass `change_of_mind` is the admin route, and neither the artist nor the buyer
  can cause `stripe_refund_id` to be written by any action available to them.
- **The relist decision on a resume.** `wasShipped = !pieceIsWithArtist(order)` at `:333` is
  still computed for every call, resume included, so the three-state possession partition from
  r7 still governs the relist. The return gate is the only possession question the resume
  skips, and once money is genuinely gone that is the right trade.
- **The artist-cancel refusal stranding an order.** Pickup orders hit the `is_pickup` 409 at
  `cancel-unshipped:44` first, so the new check never applies to them. The buyer's door is
  untouched. An unshipped, non-pickup, artist-approved refund settles cleanly: `approve-refund`
  writes a `required: false` return record (`:105-112`), so `returnBlocksSettlement` returns
  null and the admin's settle goes through. The Studio button's condition
  (`SalesSection.tsx:334`) and the route's (`cancel-unshipped:72`) are the same predicate on
  the same column.
- **The cron and approved refunds.** `.is('refund_approved_at', null)` at
  `fulfillment-windows:68` still holds, so fix 2 does not push the artist's cancel onto the
  cron under a fault reason — r8's P1 stays closed.
- **The dispute handlers against the adopted ids.** `selectDisputeOpenAction`
  (`disputeOutcome.ts:75`) returns `post_refund` whenever `stripe_refund_id` is set, so an
  adopted id keeps a chargeback from freezing a mid-settle order — which is what lets the
  resume path work at all. `charge.dispute.closed` reverses on `transfer.amount_reversed`
  rather than on the row's id (`webhooks/stripe:936-945`), so it does not inherit the P1's
  blind spot.
- **`db-smoke.sql` §6 and §14.** `f875d61` ships no migration, and neither section needed to
  move: §6 still asserts the frozen-column set that 00061 added `refund_reason` and
  `refund_initiated_by` to, and §14 still pins `order_returns` as unwritable and unreadable by
  clients other than the two parties. Nothing in this commit widens either surface.
- **`calculateRefundSplit` and the fee/tax arithmetic.** Re-derived both branches against the
  $20 + $5 + $1.06 + $2.15 fixture: fault returns the whole charge, change-of-mind retains the
  fee and `Math.round(tax × fee / taxedBase)` of the tax. Unchanged this commit and consistent
  with the documents.
- **`fulfillmentWindow`'s +6h boundary.** Unchanged, and its disagreement with
  `evaluateProtection` is backlog #6.
