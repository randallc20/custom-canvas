# Money & order lifecycle — review r6 (legal-alignment arc) — 2026-09-03

**Files read (in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`, `docs/reviews/04-money-r5.md`,
`docs/reviews/01-auth-access-r3.md`;
`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillmentWindow.ts`,
`src/utils/evaluateProtection.ts`, `src/utils/artistRepliedInTime.ts`, `src/utils/orderRecord.ts`;
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`,
`.../return/route.ts`; `src/app/api/orders/[id]/approve-refund/route.ts`,
`.../cancel-unshipped/route.ts`, `.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`,
`.../return-shipped/route.ts`, `.../concede-dispute/route.ts`, `.../mark-delivered/route.ts`,
`.../confirm-pickup/route.ts`; `src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` lines 594–1060 (dispute-created, dispute-closed) plus the
extraction diff; `src/services/orders.ts`, `src/services/email.ts` (`sendOrderCancelledEmail`);
`src/app/(user)/orders/page.tsx` and `src/components/studio/SalesSection.tsx` (the L7/L8 controls),
`src/app/admin/orders/page.tsx` (settle, return and signature controls);
`src/utils/fulfillmentWindow.test.ts`; `src/app/api/payments/checkout/route.ts` (line items only);
migrations `00060`, `00061`, `00062`, `00064`, `00066`; `vercel.json`;
`git show 0776480` and `git show 7e9a6c9` for both extraction diffs, `git show 9bfe0ff` for the fixes.

**Partly covered, and why:** `scripts/db-smoke.sql` — §6 (order transition matrix) and §14 (returns)
read in full; §10–§13 and §15 belong to 00058/00059/00063/00065/00067 and are outside the money
slice, so I read only their headers and confirmed §12 and §15 exist. Migrations `00063`, `00065`,
`00067` read only through `git show 9bfe0ff`. I did not run vitest or db-smoke; I did run the two
date functions standalone (400 dates × 4 window lengths, plus a binary search for the `missed` flip
instant) and finding P2‑4 rests on that output, not on reading.

**Verdict:** both extractions are clean — `assessProtection` is byte-for-byte identical to the
webhook block it came from, and `settleRefund` preserved every guard, idempotency key, CAS and
Sentry path while adding one (a null payment intent). The hole in this slice is not the extraction:
it is that the whole arc reasons about fulfilment through `shipped_at`, and a **local-pickup order
has no `shipped_at`, ever** — which lets the nightly cron refund pickup orders on its own, and lets a
change-of-mind refund on a collected pickup piece settle with no return at all.

---

### P0 — The fulfilment-window cron cancels and refunds LOCAL PICKUP orders, which nobody ever promised to ship
**Where:** `src/app/api/cron/fulfillment-windows/route.ts:49-57` (the select), `:68-73`, `:103-108`;
`src/utils/fulfillmentWindow.ts:29-64`; `src/app/api/orders/[id]/confirm-pickup/route.ts:71-91`;
the intent it violates is written down at `src/components/studio/SalesSection.tsx:374-384`.

**What happens:** A pickup order is created `status = 'paid'` with `shipped_at` NULL, and it stays
that way until *both* parties tap Confirm handoff — only then does `confirm-pickup` promote it
straight to `delivered` (under the service role, so the `shipped_at` stamp in `guard_orders_update`
never fires; a delivered pickup order still has `shipped_at` NULL). The cron selects on
`.eq('status','paid').is('shipped_at', null)` and nothing downstream — not the query, not
`fulfillmentWindow`, not `cancelUnshippedOrder`, not `settleRefund` — ever looks at `is_pickup`.

So: a Houston buyer buys a $1,800 canvas for pickup on a Monday. Five business days later the cron
finds `win.missed` true, tells the artist *"'Blue Bayou' has passed its 5-business-day shipping
window and is not marked shipped. Ship it now…"* and tells the buyer *"Your order has missed its
shipping window"* — about a promise the product never made them (the buyer's card gates the whole
ship-by block on `!order.is_pickup`, so they have never seen a ship-by date). The buyer collects the
piece from the studio on day 8. Neither party taps Confirm handoff, and neither posts a `text`
message in the thread after the nudge. Five business days after the nudge, the cron calls
`cancelUnshippedOrder(by:'platform', reason:'not_shipped')`. `settleRefund`'s `requireUnshipped`
check passes — `shipped_at` is null and status is `paid` — so it refunds the **whole charge
including the service fee**, reverses the artist's payout in full, flips the order to `refunded`,
and relists the painting as `available` while it hangs on the buyer's wall.

**Why it's real:** I looked for the guard in all four places it could live and it is in none of them.
The query has no `is_pickup` filter and does not even select the column. `fulfillmentWindow`
(`:29-64`) takes only `created_at`, `shipped_at`, `fulfillment_window_days`, `agreed_ship_by`.
`cancelUnshippedOrder` selects `id, buyer_id, listing_id, artist, listing` — no `is_pickup`.
`settleRefund`'s `requireUnshipped` (`:81-87`) tests `shipped_at || status !== 'paid'`, which a
pickup order passes by construction. The rest of the product is careful about exactly this
distinction — `evaluateProtection:146-151` short-circuits pickup before any shipping requirement,
the buyer's card and the artist's card both gate the L7 block on `!order.is_pickup`, and
`SalesSection.tsx:374-384` states the rule in words: *"a no-show is a support process, not something
an artist should resolve by cancelling and relisting a piece the buyer may still turn up for
(L12)"*. The cron does precisely that, with no human present, on a nightly schedule that is live in
`vercel.json`. The second door is the same gap in the buyer's route:
`cancel-unshipped/route.ts:40-64` has no `is_pickup` check either — the Orders page hides the button
(`page.tsx:312`), but a buyer who has already collected the piece can POST the route directly after
the window and be refunded in full.

**Fix direction:** Exclude `is_pickup` orders from the cron's select and reject them in
`cancel-unshipped` — the shipping promise the whole L7 path enforces does not exist for them. The
belt-and-braces version is a `requirePickupEligible`-style check inside `settleRefund` beside
`requireUnshipped`, so a fourth caller cannot reopen the same door.

---

### P0 — A change-of-mind refund on a *collected pickup* order requires no return, so the buyer keeps the artwork and the money
**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:54` (`needsReturn = !!order.shipped_at`)
and `:89`; `src/utils/orderReturns.ts:36-44`; `src/lib/orderReturns.ts:53-55`;
`src/utils/orderReturns.ts:93-94` (`if (!ret) return null`);
`src/components/studio/SalesSection.tsx:449-453`.

**What happens:** 9bfe0ff fixed r5's P1 (a return authorised for a piece still on the artist's wall)
by making "does the buyer have the piece?" mean `!!shipped_at`. For a pickup order that answer is
always false, including after the buyer has physically walked out with the painting.

A buyer collects a $2,400 piece; both parties confirm the handoff, so the order is `delivered` with
`shipped_at` NULL. A week later they change their mind and ask in Messages. The artist opens Approve
refund and the modal tells them *"This piece hasn't shipped, so there is nothing for the buyer to
send back — no return address needed"* — about a painting that left their studio. No address is
asked for, `authorizeReturn` is skipped entirely (`:89`), and no `order_returns` row is written.
An admin then settles `change_of_mind`; `returnBlocksSettlement(null)` returns `null` at
`utils/orderReturns.ts:94`, so the gate is open. The buyer is refunded price + shipping + tax, the
artist's payout is reversed, and the buyer keeps the artwork. That is the exact outcome
DECISIONS.md D9/D10/D13 and Terms of Sale §5 exist to prevent ("you may not keep both").

**Why it's real:** I tried to find the innocent explanation in each layer and there isn't one.
`approve-refund` accepts `delivered` (`:37`) with no `is_pickup` condition, and the Approve-refund
button in Studio is rendered for `['paid','shipped','delivered']` with no pickup gate
(`SalesSection.tsx:417-431`). `authorizeReturn` would not save it either — it computes
`required` from the same `!!order.shipped_at` (`lib/orderReturns.ts:55`), so even calling it would
produce `required: false`. And the settle gate treats a missing record as "nothing owed", so there
is no later backstop. This is a regression introduced by 9bfe0ff: before it,
`returnRequiredByDefault('change_of_mind')` was unconditionally `true`, so the pickup case *was*
gated. The unshipped case the fix was aimed at is genuinely different — there the artist still has
the piece — but `shipped_at` is the wrong proxy for that fact.

**Fix direction:** The predicate is "did the buyer take possession", which is
`!!shipped_at || (is_pickup && both handoff confirmations)`, not `!!shipped_at`. Pass that from
both call sites and have the artist's modal ask for the studio address on a confirmed pickup handoff
the same way it does for a shipped piece.

---

### P1 — Nothing in the product can require a return for a *fault* refund: the settle gate is only ever armed on the change-of-mind path
**Where:** `src/app/admin/orders/page.tsx:296-330` (the only return controls) versus
`src/app/api/admin/orders/[id]/return/route.ts:65-76` (the `authorize` action);
`src/utils/orderReturns.ts:46-53`.

**What happens:** `returnRequiredByDefault` says a return is required by default for `damaged` and
`not_as_described`, and DECISIONS.md D13 lists "admin authorisation for fault returns" among what
was *built*. The route exists. No control anywhere calls it: a repo-wide search for the `authorize`
action finds only the route's own schema. `/admin/orders` renders return controls only inside
`if (!ret || o.status === 'refunded') return null` (`:299`) — receive, accept-inspection and waive,
all of which act on a record that already exists — and the only creator of that record in the whole
product is `approve-refund`, which always passes `reason: 'change_of_mind'`.

So a buyer reports a canvas arrived materially damaged. Support settles it from `/admin/orders` with
reason "Arrived damaged": a fault refund, so `settleRefund` waives the artist-approval requirement,
returns the whole charge including the service fee, reverses the artist's payout — and the gate
never engages, because no `order_returns` row was ever created. The buyer keeps the damaged piece
with no record that a return was owed, waived, or judged unnecessary. The documents allow waiving
that return on four named grounds; what they do not contemplate is the platform being unable to ask.

**Why it's real:** I checked whether the gate might be armed elsewhere for fault reasons — it is not:
`authorizeReturn` has exactly two callers (`approve-refund`, hard-coded to `change_of_mind`, and the
admin route's `authorize` action, which has no caller in the UI), and `order_returns` has no client
write grant at all (db-smoke §14 pins this). I also checked that the admin has some other visible
prompt: `page.tsx:299` returns null when there is no record, so the settle modal shows the split and
nothing about a return.

**Fix direction:** Give `/admin/orders` an Authorise-return control next to the settle button that
posts the `authorize` action with the Custom Canvas return address, defaulted on for `damaged` and
`not_as_described`; and make the settle modal say, for those reasons, whether a return is on record.

---

### P2 — The r5 P3 ship-by boundary fix is a no-op: the window is still missed at 7:00pm Houston ON the promised day, and Friday ship-bys got two days stricter
**Where:** `src/utils/fulfillmentWindow.ts:49-61`; `src/utils/evaluateProtection.ts:97-115`
(`businessDaysBetween`) and `:156` (requirement 1); `src/utils/fulfillmentWindow.test.ts:78-84`.

**What happens:** 9bfe0ff replaced `businessDaysBetween(created_at, now) > windowDays` with
`now > endOfUTCDay(shipByIso)` and its commit message records the r5 P3 as fixed. The two
expressions flip at the same instant. The old code never compared instants — it compared UTC-day-
normalised business-day *counts* — so the comment at `:49-54` justifying the change describes a
mechanism the old code did not have.

I ran both predicates and binary-searched the flip instant. For the P3's own example
(`created_at = 2026-08-04T02:00Z`, displayed "August 11, 2026") old and new both flip at
`2026-08-12T00:00:00.000Z` = **11 August, 7:00pm CDT** — identical, to the millisecond. Same for a
midday Monday sale, a midday Wednesday sale and an 23:00Z sale: every case flips at 7:00pm CT on the
displayed date. The one case that did change is a ship-by that lands on a **Friday**: old flipped
Sunday 7pm CT, new flips **Friday 7pm CT** — two days earlier, a silent tightening nobody asked for.

The consequence is not only cosmetic, because seller-protection requirement 1 shares the boundary:
an artist told "Ship by September 11" who drops the parcel at 8pm Houston on 11 September stamps
`shipped_at = 2026-09-12T01:00Z`, `businessDaysBetween` returns 6 > 5, and requirement 1 fails. They
shipped on the day they were promised and lost seller protection for it; on a later non-receipt
chargeback their payout is reversed instead of the platform absorbing it. Meanwhile the buyer's
**Cancel for a full refund** button appears at 7:01pm on that same evening.

**Why it's real:** verified by executing both implementations rather than reading them (output in
this pass's notes). The test that pins the fix
(`fulfillmentWindow.test.ts:78-84`, "an evening order is not missed at the same hour on the promised
day") evaluates at `T23:00:00Z`, which is 6:00pm CT — one hour inside the boundary — so it passes
while asserting nothing about the Houston day it names in its comment. Substituting the real end of
the Houston day (`T04:59:59Z` the next date) fails it.

**Fix direction:** r5's stated direction still applies and was not taken: anchor both functions to a
Houston civil day — normalise `created_at` to `America/Chicago` before counting and treat the
deadline as the end of that local day — with one timezone constant shared by `businessDaysBetween`,
`addBusinessDays` and `fulfillmentWindow`. The test needs a case at 23:30 CT on the promised day.

---

### P2 — The settle gate is fail-open when its own record fails to be created, and nothing anywhere shows that it is missing
**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:89-102`;
`src/utils/orderReturns.ts:93-94`; `src/app/admin/orders/page.tsx:299`.

**What happens:** `approve-refund` deliberately does not fail the approval when `authorizeReturn`
returns an error — the comment at `:98-99` is right that failing would strand the order on
"already approved". But the compensating half does not exist. The approval is committed with
`refund_approved_at` and `refund_reason = 'change_of_mind'`, every admin gets a "Refund to settle"
bell, and `returnBlocksSettlement(null)` reads a missing record as "nothing to wait for". So a
transient failure of one `order_returns` upsert silently converts a gated refund into an ungated
one: an admin opens `/admin/orders`, sees a refund the artist approved and no return row at all
(`:299` renders nothing when `ret` is null), settles it, and the buyer of a delivered piece keeps
both. The only trace is a Sentry exception nobody is required to read before settling.

**Why it's real:** I checked for a backstop at settle time and there is none — `settleRefund:113-119`
reads `order_returns` and blocks only on a record it finds. I also checked whether the admin page
distinguishes "no return needed" from "no return record": it does not; both render as the absence of
the block at `:296-330`.

**Fix direction:** Stamp the intent on the order (or write the `order_returns` row first, inside the
same statement as the approval) so `settleRefund` can tell "no return required" from "the return
record was never written", and treat the second as blocking. At minimum, surface it on the admin row
so the person clicking Settle sees it.

---

### P2 — When the platform cancels an artist's sale and reverses their payout, the artist is told only by an in-app bell
**Where:** `src/lib/cancelUnshipped.ts:104-117`; `src/services/email.ts:520-550`.

**What happens:** `cancelUnshippedOrder` builds a recipient list of whichever party did not do the
cancelling, reads each recipient's email — and then sends mail only when `r.role === 'buyer'`
(`:109`). So on the cron's platform-cancel branch the artist learns that their sale was cancelled,
the buyer refunded in full and their payout reversed from a notification row and nothing else. That
is the one branch where an email is most needed: the branch runs *because* the artist has not
responded to an in-app nudge for five business days, so by construction the app is where they are
not looking. L7's own reasoning for emailing the buyer on `propose-ship-by` — "a buyer waiting on a
piece is not necessarily logged in" — applies with more force here.

**Why it's real:** the recipient loop already fetches `person.email` for the artist and discards it,
so this is a deliberate-looking condition rather than a missing lookup; and the existing template is
buyer-worded throughout ("appear on your statement", "Find another piece"), so simply lifting the
role check would send an artist a buyer's email. There is no artist-facing cancellation template.

**Fix direction:** Add an artist-worded `order_cancelled` variant that names the reversed payout and
the reason, and send it on the `artist` recipient. Keep it fire-and-forget with the same Sentry catch
the buyer send uses.

---

## Appendix: minor

- **r5's P2 on the shared idempotency key understates it.** After a lost `stripe_refund_id` persist
  (`settleRefund.ts:159`, unasserted) the key expires at 24 hours, but the retry is then refused
  *permanently*, not for 24 hours: Stripe rejects a second refund whose amount exceeds the
  unrefunded remainder, and the fault split is the entire charge. `settleRefund` reports that as
  "Refund failed at Stripe — safe to retry" and the order can never be closed. The upside is that
  the same ceiling is what actually prevents a double refund once the key expires — the key alone
  does not.
- `settleRefund.ts:127-131`, `:159`, `:175` — the three interior writes the crash-safety design
  depends on are unchecked (`.update()` with no error check and no `.select()`), including the one
  whose comment says it exists so a crash "leaves a row that says what was being done".
- `settleRefund.ts:168` — when `charge.transfer` is null the reversal is skipped, the order closes as
  refunded and `payout_reversed_cents: 0` is returned with no Sentry: the platform silently eats the
  artist's payout. Pre-existing (identical in `0776480`), not introduced by the extraction.
- `signature-confirmed/route.ts:90-97` re-assesses and writes `protection_status` off a read taken
  before the CAS; the dispute-*closed* handler decides the payout reversal from its own read at
  `webhooks/stripe/route.ts:855` and never re-reads `protection_status` before
  `createReversal` (`:946`). A signature recorded inside that ~1s window reverses a now-protected
  artist's payout. UNVERIFIED as reachable — settling it needs the two handlers timed against a real
  webhook delivery — and the window is ~1 second against a deadline measured in days.
- `orders.window_missed_at` has no readers anywhere (written by the cron at `:124`, nulled by
  `accept-ship-by:57`, selected by nothing else). It is also never stamped when the artist proposes
  a date before the nudge runs, so it does not even record what its comment claims.
- `cron/fulfillment-windows/route.ts:96-102` — hitting the 25-cancel cap `break`s the whole loop, so
  stage-1 *nudges* for every later order are skipped for that run too.
- `cron/fulfillment-windows/route.ts:110-115` logs Sentry `'error'` for the benign, expected case of
  an order that shipped between the read and the settle.
- `admin/orders/[id]/return/route.ts:78-98` (`receive`) still has no CAS on `received_at` /
  `inspection_outcome`, so `rejected` can be flipped to `accepted` by a second call — the one write
  that unblocks money. Unchanged from r5's appendix; noted only because P1 above would make this
  path reachable from the UI for the first time.

## Not findings

- **The `settleRefund` extraction.** Diffed line by line against `git show 0776480`. Every guard,
  both idempotency keys, the step-skipping retry, the close CAS (`.neq('status','refunded')` +
  `.select('id').maybeSingle()`), the relist count, the `.eq('status','sold')` relist CAS and all
  five Sentry paths survive with identical semantics. The guards were reordered (disputed now
  precedes the approval check), which changes only which error message a caller sees first, and one
  guard was **added**: a null `stripe_payment_intent_id` now 409s instead of being handed to Stripe.
- **The `assessProtection` extraction.** Byte-for-byte identical to the block removed from the
  webhook in `7e9a6c9`; only `export` was added. Nothing lost.
- **Three callers, one refund.** No path double-refunds, double-reverses or double-relists. The
  close CAS admits exactly one caller past step 3, so only one caller relists and only one sends
  notifications; Stripe's per-key response coalescing handles the concurrent identical case and its
  unrefunded-amount ceiling handles the post-expiry case.
- **The fault/change-of-mind arithmetic.** `refundAmount` on a fault reason is
  `amount + shipping + buyer_fee + amount_tax`, which is exactly the three checkout line items plus
  Stripe Tax (`payments/checkout/route.ts:115-136`, `orderRecord.ts:150-174`) — the whole charge and
  never a cent more. The change-of-mind branch is strictly smaller by `buyer_fee + feeTax`, and the
  single `Math.round` can only cost the buyer half a cent.
- **A change-of-mind refund cannot be settled without the artist.** `refund_approved_at` has exactly
  one writer (`approve-refund`, artist-gated, CAS on `IS NULL`) and is frozen for non-privileged
  writers in `guard_orders_update`.
- **The signature re-assessment cannot upgrade an order it should not.** Every other protection
  input is frozen once `status = 'disputed'`: `tracking_number`/`carrier` (00057, restated in 00066
  `:100-103`), `delivered_at` and the evidence snapshot (`:77-92`), `fulfillment_window_days`
  (`:82`), and `mark-delivered` requires `status = 'shipped'`. Requirement 6 can only ever go
  true→false with time. So the re-assessment turns only on the signature, and it only ever writes an
  upgrade.
- **`addBusinessDays` and `businessDaysBetween` are exact inverses.** 400 start instants across
  every weekday and hour × window lengths 1/3/5/10: zero failures.
- **The cron cannot cancel an order that shipped a moment ago, one with a proposed date, or one
  where the artist replied.** `settleRefund`'s `requireUnshipped` re-reads inside its own read;
  `proposed_ship_by` short-circuits both stages; `artistSpokeSince` resolves lenient on every read
  failure and counts only `message_type = 'text'`, so the platform's own system notes cannot be
  mistaken for the artist speaking. Two concurrent runs are safe: stage 1 is CAS-stamped and stage 2
  converges on the close CAS.
- **The buyer's cancel-right UI and the route now agree exactly.** `page.tsx:317`
  (`agreed_ship_by ? null : proposed_ship_by`) and `cancel-unshipped:53` (`!!proposed_ship_by &&
  !agreed_ship_by`) compute the same predicate, and `agreed_ship_by` reaches both pages because
  `services/orders.ts` selects `*`.
- **`order_returns` is not client-writable and `return_address` does not leak.** db-smoke §14 asserts
  no INSERT/UPDATE/DELETE grant to `anon`/`authenticated`, no `anon` SELECT, both parties can read
  and an outsider cannot — all under `SET ROLE`, not just JWT claims.
