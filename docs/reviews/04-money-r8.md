# Money & order lifecycle — review r8 (legal-alignment arc) — 2026-09-03

**Files read (in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (D9/D10/D13 and the 2026-07-06 refund ruling
with its L6 amendment); `docs/reviews/04-money-r5.md`, `-r6.md`, `-r7.md`, `01-auth-access-r3.md`,
`-r4.md`, `-r5.md` (headings + every finding, to avoid re-reporting).

`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillment.ts`,
`src/utils/fulfillmentWindow.ts`, `src/utils/evaluateProtection.ts`, `src/utils/artistRepliedInTime.ts`;
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`, `.../return/route.ts`;
`src/app/api/orders/[id]/approve-refund/route.ts`, `.../cancel-unshipped/route.ts`,
`.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`, `.../return-shipped/route.ts`,
`.../concede-dispute/route.ts`, `.../confirm-pickup/route.ts`;
`src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` — the full arc diff (`git diff 7e9a6c9^..HEAD`), plus
`charge.refunded` (482–594) and `charge.dispute.created/updated` (594–845) read in full;
`src/app/api/payments/checkout/route.ts` (line items and metadata), `src/app/api/messages/route.ts`,
`src/app/api/commissions/[id]/accept|complete|updates/route.ts` (the other `messages` writers);
`src/services/orders.ts`, `src/services/messages.ts`;
`src/app/admin/orders/page.tsx`, `src/app/(user)/orders/page.tsx`,
`src/components/studio/SalesSection.tsx`;
migrations `00060`–`00064`, `00066`, plus `00001`/`00022`/`00045`/`00056`/`00057` where they define
`messages.message_type`, `set_order_delivered_at` and the message-type guard;
`scripts/db-smoke.sql` §14 in full, §6 headers;
`git show 0776480^:…/refund/route.ts` (the pre-extraction route, diffed by hand against
`settleRefund`), `git show 7e9a6c9` (the `assessProtection` extraction), `git show f865b9d`,
`git show ef365e9` (the r6/r7 fixes).

**Partly covered, and why:** `scripts/db-smoke.sql` §10–13 and §15–16 belong to 00058/00059/00063/
00065/00067/00068 (acceptance, listing standards, signup, DMCA) and are outside the money slice —
headers only. Migrations `00063`, `00065`, `00067`–`00069` read only where they touch `orders`,
`order_returns` or `guard_orders_update`. I did not run vitest or db-smoke. I did execute
`businessDaysBetween`, `addBusinessDays` and `fulfillmentWindow`'s deadline standalone (4,000
inverse cases; the boundary probed around the promised day) — the arithmetic claims below rest on
that output, not on reading.

**Verdict:** Both extractions are clean — I diffed `settleRefund` line by line against `0776480`
and `assessProtection` against `7e9a6c9`, and nothing was dropped, reordered in a way that matters,
or lost a Sentry path. The damage in this round is again in the *edges around* the fixes: the fix
for r7's P0 put the decision behind a React state that is never reset, the fix's own direction for
`settleRefund`'s relist was not applied, the cron still cannot see that a refund is already agreed,
and r6's P1 (admin-authorised fault returns) is recorded in DECISIONS as built but has no caller.

---

### P1 — The cron converts an artist-approved change-of-mind refund into a full fault refund, returns the service fee, and tells both parties the artist was unreachable

**Where:** `src/app/api/cron/fulfillment-windows/route.ts:49-64` (the select) and `:87-124`
(stage 2); `src/lib/cancelUnshipped.ts:50-59`; `src/lib/settleRefund.ts:111-118`, `:138`;
`src/utils/refundSplit.ts:114-125`. Same defect through two manual doors:
`src/app/api/orders/[id]/cancel-unshipped/route.ts:54-88` and
`src/components/studio/SalesSection.tsx:324`, `:370-377`.

**What happens:** A buyer asks for a refund in Messages on day 2 of a $2,400 shipped-order sale
that has not been posted yet. The artist opens Approve refund in Studio. The order is unshipped and
not pickup, so `needsReturn` is false, no `order_returns` row is written, and the route stamps
`refund_approved_at`, `refund_reason = 'change_of_mind'`, `refund_initiated_by = 'artist'`. Every
admin gets a "Refund to settle" bell. Settling is manual, and nobody does it that week.

Day 6 (business): the window is missed. The cron's select is `status = 'paid'`,
`shipped_at IS NULL`, `is_pickup = false` — there is no `refund_approved_at` filter — so this order
is picked up like any other. Stage 1 stamps `platform_nudged_at` and tells the artist *"Ship this
order, or offer a new date… if we do not hear from you within 5 business days we will cancel the
order and refund the buyer in full"*, on an order they have already agreed to refund. The refund
conversation is over, so nobody writes in the thread. Five business days later stage 2 finds no
`proposed_ship_by` and no artist message since the nudge, and calls
`cancelUnshippedOrder(by: 'platform', reason: 'not_shipped')`.

`not_shipped` is a fault reason, so `settleRefund:111` waives the approval check and
`calculateRefundSplit` returns `amount + shipping + buyer_fee + amount_tax` — **the whole charge,
service fee and all of its tax included**, on a refund the documents say retains the fee. The
artist's payout is reversed, the listing is relisted, the buyer is emailed "refunded in full…
including the service fee", and the thread and the artist's bell say *"Custom Canvas cancelled this
order… we were unable to reach the artist"* about an artist who acted on day 2. On a $2,400 sale
the fee and its tax are roughly $80 the platform hands back against its own ruling, with no human
in the loop.

**Why it's real:** I looked for the guard in every layer. The cron select has no
`refund_approved_at` predicate (`:49-64`); `cancelUnshippedOrder` reads only ids and titles
(`cancelUnshipped.ts:43-48`); `settleRefund`'s only approval logic is the *inverse* one — it
refuses a change-of-mind settle without approval and says nothing about a fault settle on an order
that already has one. The reason write at `:143` is `.is('refund_reason', null)`, so the row keeps
saying `change_of_mind` while the money went out at the fault split (that half is r5's P2; the new
half is that the *money* is wrong, not just the label, because no human ever assessed fault here).
The two manual doors are the same hole: `cancel-unshipped` has no `refund_approved_at` check, and
`SalesSection.tsx:324` renders the whole L7 block — including **Cancel order** — for any
`status === 'paid' && !is_pickup` order, without the `!order.refund_approved_at` condition it
correctly applies to Mark as Shipped two lines later (`:413`). The buyer's own door is at least
arguably legitimate (Terms of Sale §3 gives them an independent full-refund right once the window
is missed); the cron's is not — its stated premise, "we cannot reach the artist", is false by
construction here.

**Fix direction:** Exclude `refund_approved_at IS NOT NULL` from the cron's select — an order whose
refund is already agreed is not an abandoned sale, and the nudge text is wrong for it too. If the
platform should still be able to close such an order out, it should settle it at the reason already
on the row rather than overwriting the economics with `not_shipped`; hide the artist's Cancel-order
button once they have approved a refund, for the same reason Mark as Shipped is hidden.

---

### P1 — The "buyer never collected this piece" checkbox is never reset, so the second pickup refund in a Studio session settles with no return and relists the painting

**Where:** `src/components/studio/SalesSection.tsx:53` (`useState(false)`), `:136-137`
(`needsReturnFor`), `:184-186`, `:198-206`, `:434`, `:449`, `:214`, `:537`;
`src/app/api/orders/[id]/approve-refund/route.ts:61-63`, `:98`;
`src/utils/orderReturns.ts:93-94`; `src/lib/settleRefund.ts:231`.

**What happens:** `ef365e9` fixed r7's P0 by asking the artist, on a pickup order nobody has
confirmed, whether the piece was ever collected. The answer lives in one component-level boolean,
`pieceNotCollected`, and **nothing resets it** — not opening the modal (`:434`
`onClick={() => setRefundOrder(order)}`), not closing it (`:449`, `:537`), not a successful submit
(`:214` clears `refundOrder` only).

An artist has two local-pickup sales. On order A the buyer never turned up; the artist opens
Approve refund, ticks *"The buyer never collected this piece — it is still with me"*, and approves.
Correct. Studio stays mounted. An hour later the buyer of order B — who did collect their canvas,
but neither party ever tapped Confirm pickup handoff — asks for a refund in Messages. The artist
opens Approve refund on B. `pickupPossessionUnknown(B)` is true, so the checkbox renders — already
ticked. `needsReturnFor(B)` is therefore false: the address fields and the packing-instructions
field are not rendered at all, the modal shows *"The buyer never received this piece, so there is
nothing to send back — no return address needed"*, and the button reads "Approve refund" rather
than "Approve and authorise the return". Nothing is missing from the form, so nothing prompts the
artist. The POST body is `{ piece_not_collected: true }`; the route computes `needsReturn = false`
(`:61-63`), skips `authorizeReturn` (`:98`), and stamps the approval. No `order_returns` row exists,
`/admin/orders` renders nothing for a missing record (`page.tsx:299`), the admin settles
`change_of_mind`, `returnBlocksSettlement(null)` returns `null`, the money goes back — and because
`wasShipped` is `status === 'shipped' || 'delivered'` and this order is `paid`,
`settleRefund:231` relists the painting while it hangs on the buyer's wall. `confirm-pickup:51-53`
refuses once `refund_approved_at` is set, so neither party can repair the record afterwards.

**Why it's real:** I checked for a reset in every handler that touches the modal and there is none;
`returnAddress` and `returnInstructions` are equally sticky, but those are visible and benign — a
pre-filled address is obvious, a pre-ticked checkbox that *removes* the address section is not.
I checked whether the stale `true` can leak onto orders it should not: it cannot, because both the
client (`:136`) and the route (`:63`) gate it behind `pickupPossessionUnknown`, so it only ever
fires on exactly the orders where possession is unknown — which is precisely the case the fix was
written for. This is the r7 P0 outcome (piece and money both gone, listing relisted) reached
through the fix's own UI state.

**Fix direction:** Reset `pieceNotCollected` when the modal opens — set it in the same handler that
sets `refundOrder` (`:434`), alongside clearing `returnAddress`/`returnInstructions`. A stronger
version makes it three-state (unanswered / collected / not collected) and refuses to submit until
the artist answers, so the destructive default is never pre-selected.

---

### P1 — `settleRefund`'s relist decision still keys on `status`, so a waived-return local-pickup refund puts a painting back on sale while the buyer has it

**Where:** `src/lib/settleRefund.ts:64` (the select), `:210`, `:225-268`;
`src/app/admin/orders/page.tsx:324-327` (the Waive return button);
`src/utils/fulfillment.ts:21-44`.

**What happens:** r7's P0 fix direction ended *"and pass `buyerTookPossession` into `settleRefund`'s
relist decision instead of `status`"*. That half was not applied: `wasShipped` is still
`order.status === 'shipped' || order.status === 'delivered'`, and the function's own select
(`:64`) does not even fetch `pickup_confirmed_by_buyer_at` / `pickup_confirmed_by_artist_at`, so it
could not ask.

A buyer collects a $1,800 canvas from the studio. The artist taps Confirm pickup handoff; the buyer
never does, so the order stays `paid` with `shipped_at` and `delivered_at` NULL. The buyer changes
their mind; the artist approves with a return address (`buyerTookPossession` is true now, so this
part works); the return is authorised and required. The buyer will not or cannot ship a 4-foot
stretched canvas back, and an admin clicks **Waive return** on `/admin/orders` — a first-class
button that records `waived_reason: 'unnecessary'` and, in its own confirm text, "unblocks the
refund without the piece coming back". The admin then settles. The gate opens (`waived_at` set),
the money moves, and `:231` relists the listing from `sold` to `available` with `sold_price_cents`
nulled. A second collector can now buy a painting that is in the first buyer's living room.

The identical sequence on a **shipped** order does not relist — status is `shipped`/`delivered`, so
`wasShipped` is true and the comment's own rule ("a shipped/delivered artwork is physically with
the buyer") is honoured. The rule is right; the predicate implementing it is the one r6 and r7 both
condemned.

**Why it's real:** I checked whether another layer catches it. It does not: the webhook's
`charge.refunded` relist uses the better predicate (`!!shipped_at || !!delivered_at ||
pre_dispute_status in (shipped, delivered)`, `route.ts:517-521`) but breaks out early on
`order.status === 'refunded'`, which `settleRefund` has already set, so it never runs for this
path. I checked whether a one-sided pickup confirmation could still produce `delivered`: it cannot
— `confirm-pickup:75`/`:90` promote only when *both* columns are set, and `set_order_delivered_at`
(00057:110-114) only fires on the transition into `delivered`. Two other reachable variants of the
same relist: an admin settling a fault reason with no return record at all (see the next finding),
and the sticky-checkbox path above.

**Fix direction:** Add the two pickup-confirmation columns to `settleRefund`'s select and compute
the relist from `buyerTookPossession(order)` rather than `status` — that is exactly what
`utils/fulfillment.ts` exists for, and it is the last money-path reader still keying on the old
proxy. A relist on a waived return is a support decision either way, so erring towards not
relisting is the safe direction.

---

### P1 — r6's P1 is recorded as fixed and is not: no control in the product calls the `authorize` return action, so a return can never be required for a fault refund

**Where:** `src/app/admin/orders/page.tsx:296-330` (the only return controls) versus
`src/app/api/admin/orders/[id]/return/route.ts:65-76`; `DECISIONS.md:39-45` (D13, "Built: … admin
authorisation for fault returns"); `src/lib/orderReturns.ts:30-62`.

**What happens:** Unchanged since r6 reported it. A buyer reports a canvas arrived materially
damaged; support settles from `/admin/orders` with reason "Arrived damaged". It is a fault reason,
so `settleRefund` waives the artist-approval requirement, returns the whole charge including the
service fee and reverses the artist's payout — and the gate never engages, because no
`order_returns` row was ever created. The buyer keeps the damaged piece with no record that a
return was owed, waived, or judged unnecessary. `returnRequiredByDefault` says `damaged` and
`not_as_described` require a return by default; nothing in the product can act on that.

**Why it's real:** I am raising a previously-reported P1 only because the brief states every P0/P1
from the four earlier passes is fixed, and this one is not. `git log -- src/app/admin/orders/page.tsx`
ends at `1f703bd` (the original L8 commit) — none of `9bfe0ff`, `f865b9d` or `ef365e9` touched that
file. A repo-wide search for the `authorize` action finds only the route's own zod literal and its
comment; `authorizeReturn` still has exactly two callers, `approve-refund` (hard-coded to
`change_of_mind`) and the uncallable admin branch. The admin page renders return controls only
inside `if (!ret || o.status === 'refunded') return null` (`:299`), i.e. only on a record that
already exists. Dismiss this line quickly if the fix was deliberately deferred — but D13 currently
claims it as shipped.

**Fix direction:** As r6 wrote it: an Authorise-return control next to Settle that posts the
`authorize` action with the return address, defaulted on for `damaged` and `not_as_described`, and
a line in the settle modal saying whether a return is on record. Until then, D13's "Built" list
should say "route only, no UI".

---

### P2 — The settle gate's own read discards its error, so a transient failure on `order_returns` opens the one gate that stops the buyer keeping the piece and the money

**Where:** `src/lib/settleRefund.ts:129-135`; `src/utils/orderReturns.ts:93-94`.

**What happens:** The gate is
`const { data: ret } = await admin.from('order_returns').select('*').eq('order_id', order.id).maybeSingle();`
— the `error` field is not destructured, let alone checked. On any transient failure (a pooler
restart, a statement timeout) PostgREST returns `data: null` with an error, `ret` is `null`,
`returnBlocksSettlement(null)` returns `null` because "no record" means "no return owed", and the
settle proceeds. A buyer with an authorised, required, not-yet-shipped return on a $2,400 delivered
painting is refunded in full and the artist's payout is reversed, with no 502, no retry and no
Sentry line — the order simply closes as `refunded`.

**Why it's real:** the direction of the failure is the point. Every other read in this function
fails *closed*: a failed order read yields `order == null` → 404, a failed relist count is
explicitly checked and returns 502 (`:238-243`). This one, the only read whose result is a money
gate, fails open. The codebase states the opposite principle in its own words twice — the webhook's
"A failed evidence read is a transient error… never a verdict" (`webhooks/stripe:774-779`) and
checkout's refusal to start on a failed photo count (`checkout/route.ts:100-106`). Related to but
distinct from r6's open P2, which is about the record failing to be *created* in `approve-refund`;
this is the read side, inside the gate itself, and it is one line.

**Fix direction:** Destructure the error and return a 502 "could not check the return — retry" when
it is set; a settle that cannot read the gate has not passed it. This does not fix r6's P2 (a
record that was never written still reads as "nothing owed") but it removes the second way to reach
the same outcome.

---

## Appendix: minor

- `webhooks/stripe:868-871` — the new admin dispute notification computes `signatureTodo` from
  `order.signature_required` with no `is_pickup` check. `signature_required` is snapshotted from
  price alone (`checkout:109`), so a disputed $2,400 **local pickup** order tells the admin to open
  "the carrier's tracking page" and record a signature that cannot exist, and promises it
  "re-assesses the order" — `evaluateProtection` short-circuits on `isPickup` before requirement 4,
  so recording it changes nothing. New in this arc.
- `admin/orders/page.tsx:286` pre-selects `not_shipped` — a **fault** reason, i.e. the whole charge
  including the service fee — as the default for every order the artist has not approved, including
  a `delivered` one. The confirm dialog's label ("the piece was never shipped") is the only thing
  that catches a mis-click.
- `lib/orderReturns.ts:79-95` upserts on `order_id` with only the authorisation columns, so
  re-authorising a return on an order whose previous return was already `accepted` or `waived`
  leaves those columns set and the gate open for the new one. Admin-only, and the table comment
  says a second return is a support conversation.
- `messages.message_type` is `TEXT DEFAULT 'text'` and **nullable** (00001:291); the CHECK and
  00056's guard are both NULL-permissive (`NEW.message_type NOT IN (…)` is NULL, not TRUE). Both
  new `.neq('message_type','system')` filters (`assessProtection:62`, cron `:221`) therefore drop a
  NULL-typed row. No writer in `src/` produces one today, so this is latent, not live.
- `commissions/[id]/updates/route.ts:66` writes a genuine artist-authored progress note with
  `message_type: 'system'`. Since `ef365e9` it counts neither as the artist speaking for the cron
  nor as a reply for requirement 6. Only bites a collector who has both a commission and a listing
  order with the same artist (threads are keyed by participant pair).
- `settleRefund.ts:175`, `:191` — the two interior persists the crash-safety design depends on are
  still unchecked `.update()`s with no `.select()`. Unchanged from `0776480`; noted again because
  CONVENTIONS §1 is explicit and these are the writes that decide whether a retry can resume.
- r7's P2-4 (the six-hour disagreement between `fulfillmentWindow`'s Houston-day deadline and
  requirement 1's UTC-day count) is unchanged and confirmed by execution: at
  `2026-08-11T00:30Z` on a "ship by August 10" order, `missed` is `false` while
  `businessDaysBetween` is already 6. Known, open, not made worse.

## Not findings

- **The `settleRefund` extraction.** Diffed by hand against `git show 0776480^:…/refund/route.ts`.
  Both idempotency keys (`refund_<id>`, `reversal_<id>`), the persist-immediately-after-each-Stripe-
  mutation retry design, the close CAS (`.neq('status','refunded')` with an asserted
  `.select('id').maybeSingle()`), the relist count matching `orders_one_live_per_listing`, the
  `.eq('status','sold')` relist CAS, the 500-character `admin_reason` truncation (moved from the
  route's parse into `:169`, same effect) and all five Sentry paths survive with identical
  semantics. Three guards were **added** (null payment intent, `requireUnshipped`, `is_pickup`);
  `refund_initiated_by` was added to the Stripe metadata; the `disputed` check moved above the
  approval check, which only changes which 409 a caller sees first. Nothing was dropped.
- **The `assessProtection` extraction.** `git diff 7e9a6c9^..HEAD` shows the block moved
  byte-for-byte out of the webhook, plus `export`; the only later change is the
  `.neq('message_type','system')` line `ef365e9` added. The webhook's other changes in the arc are
  exactly the two the brief names: `signature_required, signature_confirmed` added to the
  dispute-created select, and the two notification bodies.
- **Three callers, one refund.** No path double-refunds, double-reverses or double-relists. Two
  concurrent settles with the same reason send byte-identical bodies, so Stripe replays one refund;
  `reversal_<id>` always carries `artist_payout_cents`, so it always replays; the close CAS admits
  exactly one caller past step 3 and the loser returns before any notification. What the keys do
  **not** protect: two doors with *different* reasons (buyer `not_shipped` vs artist
  `artist_cancelled` vs admin `change_of_mind`) send different bodies under the same key, which
  Stripe rejects and `settleRefund` reports as "safe to retry" (r5's P2); and beyond 24 hours the
  key has expired, at which point Stripe's unrefunded-amount ceiling and the persisted
  `stripe_refund_id` are the real guard — a fault split, being the whole charge, leaves a remainder
  of zero, so a second refund is refused outright rather than paid twice.
- **The fault/change-of-mind arithmetic.** `refundAmount` on a fault reason is
  `amount + shipping + buyer_fee + amount_tax`, which is exactly the three checkout line items
  (`checkout:113-139`) plus `total_details.amount_tax` — the whole charge and never a cent more.
  The change-of-mind branch is strictly smaller by `buyer_fee + feeTax`, `Math.max(0, …)` covers
  the rounding edge, and the single `Math.round` can cost the buyer at most a half-cent.
- **Settling a change-of-mind refund the artist never approved.** Refused at `settleRefund:111-118`;
  `refund_approved_at` has one writer (`approve-refund`, artist-gated, CAS on `IS NULL`) and is
  frozen for non-privileged writers in `guard_orders_update` (00061/00062/00066).
- **The return gate on a retry.** The gate is re-read on every call and the reason write at `:143`
  is *after* it, not before, so a retry of a half-finished settle re-passes the gate rather than
  skipping it. The one way a retry is wrongly *blocked* — an admin flipping `accepted` to
  `rejected` between the money and the close, which `admin/.../return` permits because `receive`
  has no CAS — is r5's P2 and r6's appendix, unchanged.
- **Signature confirmation racing the dispute-created CAS.** Three disjoint predicates: the
  signature route requires `status = 'disputed'` and CASes on `protection_status = 'ineligible'`;
  the created handler CASes on `.neq('status','disputed')`; the closed handler's late assessment
  CASes on `'pending'`. It cannot upgrade wrongly: every other protection input is frozen once
  `disputed` (00057/00066), and requirement 6 only ever degrades with time
  (`artistRepliedInTime:50` returns false permanently once a reply lands more than three business
  days late), so an upgrade can only be the signature. The r6 appendix's ~1s window against the
  closed handler's own read is unchanged and still UNVERIFIED.
- **`addBusinessDays` and `businessDaysBetween` are exact inverses.** 800 start instants across
  every weekday and hour × window lengths 1/3/5/10/20 — 4,000 cases, zero failures. And the window
  is **not** missed on the promised day: with `created_at = 2026-08-03T12:00Z` and a 5-day window,
  `missed` is false through `2026-08-11T05:59:59.999Z` (23:59:59 CST / 00:59:59 CDT on the day
  after the promised date) and true from `06:00:00.001Z`. The deadline errs in the artist's favour
  by up to an hour, which is what the comment claims.
- **The cron's select and its concurrency.** `status='paid'`, `shipped_at IS NULL`,
  `is_pickup = false`, `created_at ASC`, `limit 200`; `orders.is_pickup` is `NOT NULL DEFAULT false`
  (00041), so `.eq(false)` loses no legacy rows. It cannot cancel an order that shipped a moment ago
  (`requireUnshipped` re-reads inside the money read), one with a proposed date (both stages
  short-circuit), or one where the artist replied — including with a photo or a file, since
  `ef365e9` widened the filter to everything but `system`. Two concurrent runs are safe: stage 1 is
  CAS-stamped and stage 2 converges on the close CAS, with the loser returning before any
  notification. A partial failure mid-loop leaves the cancelled orders cancelled and the rest for
  tomorrow. The one order it should not touch is the one in P1‑1 above.
- **The pickup no-money guards.** `settleRefund:88-95` and `cancel-unshipped:44-52` both refuse
  local pickup outright, and the cron filters it out of the select, so r6's P0 has three
  independent stops.
- **`order_returns` exposure.** db-smoke §14 asserts under `SET ROLE` (not JWT claims alone) that
  there is no client INSERT/UPDATE/DELETE grant, no `anon` SELECT, that both parties can read their
  own record, that an outsider cannot see the address, and that the buyer cannot accept their own
  inspection.
- **`concede-dispute`** touches no money: artist ownership check, `disputed` status check, `.is(null)`
  CAS on a column no client can write (00060).
