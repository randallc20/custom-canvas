# Money & order lifecycle — review r10 (legal-alignment arc) — 2026-09-03

**Files read (in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (D1, D6, D7, D9/D10/D13, the 2026-07-06
refund entry and its L6 amendment);
`docs/reviews/04-money-r5.md`…`-r9.md` (r9 in full; r5–r8 by finding heading) and
`docs/reviews/01-auth-access-r3.md`…`-r7.md` (headings), to avoid re-reporting.

`git show --stat` for `9bfe0ff`, `f865b9d`, `ef365e9`, `8d3d347`, and the **full money diff of
`25fc3b9`** (the round-five fix, which post-dates r9 and is where this pass is aimed);
`git show 0776480^:…/refund/route.ts` diffed by hand against `src/lib/settleRefund.ts`;
`git show 7e9a6c9` for the `assessProtection` extraction.

`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/orderReturns.test.ts`,
`src/utils/fulfillment.ts`, `src/utils/fulfillmentWindow.ts`, `src/utils/evaluateProtection.ts`,
`src/utils/disputeOutcome.ts`;
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`,
`.../return/route.ts`;
`src/app/api/orders/[id]/approve-refund/route.ts`, `.../cancel-unshipped/route.ts`,
`.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`, `.../return-shipped/route.ts`,
`.../concede-dispute/route.ts`;
`src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` — `charge.refunded` (483–597), `dispute.created/updated`
(599–855) and the `closed` handler's assessment/reversal path (856–1000);
`src/app/api/listings/[id]/route.ts` (the sold→available guard), `src/app/(artist)/listings/[id]/edit/page.tsx`
(status control), `src/components/studio/ListingsSection.tsx`;
`src/app/admin/orders/page.tsx` (in full), `src/app/(user)/orders/page.tsx` (cancel + return
blocks), `src/components/studio/SalesSection.tsx` (refund modal), `src/hooks/useOrderReturn.ts`;
migrations `00060`, `00061`, `00062`, `00064`, `00066`, `00049` (the order FKs);
`scripts/db-smoke.sql` §6 and §14 in full.

**Executed, not just read:** `addBusinessDays`/`businessDaysBetween` over 3,360 inverse cases
(28 start days × 24 hours × window 1/3/5/10/20) and `fulfillmentWindow`'s deadline probed hour by
hour across the promised day in both CDT and CST; and a throwaway vitest file (since deleted)
exercising `returnRequiredByDefault` + `returnBlocksSettlement` + `pieceIsWithArtist` for the two
states P1‑1 and P1‑2 below turn on. The arithmetic and gate claims rest on that output.

**Partly covered, and why:** `db-smoke.sql` §10–13 belong to acceptance, listing standards, signup
and DMCA (00058/00059/00063/00065) — outside the money slice; read for headers only, as r9 did.
`00063` read only for whether it touches `orders` (it does not). Migrations `00067`–`00069` checked
only for whether they redefine `guard_orders_update` (they do not; `00066` holds the live body).
I did not run the full vitest suite, db-smoke or the e2e suite.

**Verdict:** Both extractions remain faithful — I re-diffed `settleRefund` against `0776480^` and
`assessProtection` against `7e9a6c9` and found no guard, key, CAS or Sentry path dropped or
reordered, and the window arithmetic is exact. The damage this round is entirely in `25fc3b9`, the
newest fix: it made possession the single answer at the relist and the gate, but two of the three
inputs that answer the question are now consulted in only one place each — the artist's "the buyer
never collected this piece" is read at the approval door and thrown away at the settle door, and
the admin's `required: true` override was deleted from the only control that sent it, so three
fault reasons can once again settle in full while the buyer holds the painting.

---

### P1 — Since `25fc3b9` nothing in the product can require a return for a `platform_error`, `artist_cancelled` or `lost_in_transit` refund, so a piece the buyer is holding is refunded in full and stays with them

**Where:** `src/app/admin/orders/page.tsx:434-441`; `src/utils/orderReturns.ts:36-54`;
`src/lib/settleRefund.ts:146-152`; `src/app/api/admin/orders/[id]/return/route.ts:26-40, 65-76`

**What happens:** A listing is published at $50 instead of $5,000, a buyer takes it, the artist
ships it and marks it delivered before anyone notices. This is Terms of Sale §2A's obvious pricing
error — the documented outcome is that Custom Canvas cancels and returns all amounts collected, and
D9/D13 say the refund may be conditioned on the piece coming back. The admin opens `/admin/orders`
and clicks **Require a return…**, picks a reason, types the return address, and confirms a dialog
that reads "The buyer is told where to send the piece and has 7 calendar days to ship it. The refund
will not settle until it arrives and is inspected." The toast says "Recorded."

Nothing was required. `25fc3b9` removed `required: true` from that call (page.tsx:437-440), so the
route passes `required: undefined` and `authorizeReturn` falls through to
`returnRequiredByDefault(reason, hasThePiece)`. For `platform_error`, `artist_cancelled` and
`lost_in_transit` that function returns `false` **regardless of possession** —
`orderReturns.ts:46-53` only lists `change_of_mind`, `damaged` and `not_as_described`. The record is
written with `required: false` and `ship_by: null`; the `if (required && …)` block at
`lib/orderReturns.ts:108` is skipped, so the buyer is never told, never emailed, and no clock starts.
The admin row then renders **"Return cleared"** (`page.tsx:329-331`, because
`returnBlocksSettlement` short-circuits on `!ret.required`), the Settle button is offered, and the
settle goes through: `settleRefund`'s gate at `:146-152` also passes, because
`returnRequiredByDefault('platform_error', true)` is the same `false`. The buyer receives the entire
charge back and keeps a $5,000 painting.

The same shape covers an admin settling `artist_cancelled` on a delivered order, and
`lost_in_transit` on a piece that later turns up with the buyer.

**Why it's real:** I looked for the override and it is gone from every call site —
`grep` for `required` across `src/app/admin/orders/page.tsx` finds only the removed line in
`25fc3b9`'s diff, and `approve-refund` never passes it either (it relies on the default, correctly,
because its own `needsReturn` gate already fired). The route's zod schema still accepts
`required: z.boolean().optional()` (`return/route.ts:30`) and `authorizeReturn` still honours
`opts.required ?? …` (`lib/orderReturns.ts:57-58`), so the capability exists with no caller — which
is exactly the condition r8's P1 named for the `authorize` action itself, reintroduced one layer
down. The innocent explanation I tried and could not sustain: "the admin should pick `damaged`
instead." They can, and it does force the return — but `refund_reason` is the platform's own record
of *why* money moved (00061), it drives the buyer-facing sentence
(`refundSplit.ts:60-80` → "Refunded in full — the piece arrived damaged"), and every fault reason
returns the identical amount, so the workaround is purely writing a false reason into the money
record to reach a control. Confirmed by execution: `returnRequiredByDefault(r, true)` is `false` and
`returnBlocksSettlement(null, false)` is `null` for all four of `platform_error`,
`artist_cancelled`, `lost_in_transit`, `not_shipped`.

Not P0 only because it needs an admin to choose one of those three reasons on a piece the buyer
already has; r8's P1 and r9's P1, the two previous instances of "a fault refund settles with the
buyer keeping the piece", were both rated P1 and this is the third.

**Fix direction:** Put the override back on the control that was carrying it, but as a choice rather
than a constant — a checkbox in the "Require the piece back" modal, defaulted from
`returnRequiredByDefault(reason, possession)` and sent as `required` when the admin overrides it.
That keeps r9's P2 fixed (the default can no longer force a return on an unshipped order) while
restoring the judgement call D9 gives Custom Canvas; the modal must also stop promising the refund
will wait when the value it is about to send is `false`.

---

### P1 — The artist's "the buyer never collected this piece" is read at the approval door and discarded at the settle door, so an uncollected local-pickup refund can never settle and the painting is never relisted

**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:61-63` and `:76-93`;
`src/lib/settleRefund.ts:146-152` and `:232`; `src/components/studio/SalesSection.tsx:186-206`;
`src/app/admin/orders/page.tsx:287-292, 352`

**What happens:** A local-pickup order is paid for and the buyer never comes to collect. They ask
for their money back in Messages. The artist opens the refund modal in Studio → Sales, which shows
the "the buyer never collected this piece" checkbox (`SalesSection.tsx:469`, added by `8d3d347` for
exactly this case), ticks it, and approves. `approve-refund` computes
`needsReturn = buyerTookPossession(order) || (pickupPossessionUnknown(order) && body?.piece_not_collected !== true)`
→ `false`, so it asks for no address, creates **no `order_returns` row**, and stamps
`refund_approved_at` + `refund_reason = 'change_of_mind'`. Both parties are told the refund is with
Custom Canvas to settle.

The admin opens `/admin/orders` and clicks **Settle refund** (the button is shown — the hide added by
`25fc3b9` at `:292` calls `returnBlocksSettlement(ret)` with one argument, so with no record it
reports "not blocked"). `settleRefund` re-derives possession from the columns alone:
`returnRequiredByDefault('change_of_mind', buyerTookPossession(order) || pickupPossessionUnknown(order))`.
`pickupPossessionUnknown` is `true` for this row, so the gate answers "a return is owed" and 409s
with *"Use "Require a return…" on the order first, or waive it with a reason…"*. The artist's
answer is not persisted anywhere — `grep piece_not_collected src/` returns exactly two hits, the
route's own expression and the fetch body that produced it — so no retry, no second admin and no
amount of waiting changes it. The refund is stuck.

The escape route the error names actively misinforms the buyer. **Waive return** is not rendered
until a record exists (`page.tsx:326-329` returns `null` when `!returns[o.id]`) and the `waive`
action 409s with "There is no return record on this order to waive." So the admin must click
**Require a return…**, which computes `required` from the same possession columns → `true`, writes a
`ship_by`, posts *"Custom Canvas: a return has been authorised … Send it to: <address> … Ship it by
<date>"* into the thread, raises a bell and emails the buyer a demand to ship back a painting they
never received — and then waive it.

If the admin instead escapes by choosing a fault reason, the second half bites: `25fc3b9` changed the
relist to `wasShipped = !pieceIsWithArtist(order)` (`settleRefund.ts:232`), and
`pieceIsWithArtist` is `false` for an unconfirmed pickup order, so the painting the artist is
demonstrably still holding is **not** relisted. Before `25fc3b9` (`wasShipped = buyerTookPossession(order)`)
it was. The listing stays `sold` until the artist happens to find the Status control on the edit page.

**Why it's real:** I read both predicates and both call sites. The approval door's expression has
three terms; the settle door's and the relist's have two — the artist's answer is the missing third,
and `orders` has no column to carry it (00060/00061/00062/00066 add none, and `order_returns` is
never created on this path). The disproof I tried: perhaps the pickup confirmations settle it —
they do not, the premise of the case is that neither party confirmed, which is precisely the state
`pickupPossessionUnknown` was written for. Perhaps the admin page can compute the second argument —
it cannot: its `AdminOrder` select (`page.tsx:97`) fetches no `is_pickup`, no `shipped_at` and
neither pickup confirmation column, so the UI has no way to know a settle it is offering will be
refused. Confirmed by execution: for `{is_pickup: true, status: 'paid'}` with both confirmations
null, `returnRequiredByDefault('change_of_mind', …)` is `true`, `returnBlocksSettlement(null, true)`
is the block message, and `pieceIsWithArtist` is `false`.

**Fix direction:** Persist the artist's answer where the settle can read it — the natural home is an
`order_returns` row written by `approve-refund` with `required: false` and
`waived_reason: 'unnecessary'` when `piece_not_collected` is sent, which both unblocks the gate and
leaves the record D13 wants of *why* no return was owed. The relist then needs the same input, so
`pieceIsWithArtist` should take an explicit "the artist says they still have it" override rather
than inferring confidence from the two confirmation columns alone.

---

### P2 — When the signature re-assessment's own write fails, the admin is told "Signature confirmation recorded", and no path in the product can ever try again

**Where:** `src/app/api/admin/orders/[id]/signature-confirmed/route.ts:99-128`;
`src/app/admin/orders/page.tsx:193-201`

**What happens:** A $750+ shipped order is disputed; the webhook froze `protection_status =
'ineligible'` because signature confirmation was not yet recorded. The admin follows the runbook,
opens the carrier page, sees the signature, and clicks **Record signature confirmation**.
`assessProtection` now returns `protected` — the upgrade the route exists to grant — and the route
CASes `protection_status: 'protected'` at `:100-104`. If that write returns an error (a transient
Postgres/PostgREST failure), `:105-111` captures it to Sentry and leaves `reassessed = null`. Because
the assessment succeeded, `stillFailing` is `[]`, so the `warning` at `:123-127` — the whole point of
`25fc3b9`'s fix — does not fire, and `page.tsx:200` toasts the green **"Signature confirmation
recorded."**

There is then no way back. Retrying the button 409s at `:53-55` ("Signature confirmation is already
recorded") before it reaches the re-assessment. `protection_status` is frozen for non-privileged
writers (00060), and its only other writers are the dispute-created handler
(`webhooks/stripe:790`, CAS `.neq('status','disputed')` — already disputed, so it never fires again)
and the closed handler's late assessment (`:886-889`, CAS on `'pending'` — the row says
`'ineligible'`). So when the dispute closes as lost, `selectDisputeCloseOutcome` reads
`protection_status = 'ineligible'`, `platformAbsorbs` is false, and the artist's full payout is
reversed on an order that met all six requirements — a loss the platform had agreed to absorb.

**Why it's real:** The comment at `:106-111` deliberately chooses not to fail the request, and I
agree with that choice — retrying would 409 and lose the recording. What is missing is the second
half: the response says nothing, so the admin has no signal, and there is no idempotent re-assess
path. I checked whether anything else re-runs the assessment: `grep assessProtection src/` gives
three call sites (the webhook's created and closed handlers and this route), and I traced all three
CASes above; they are disjoint and none can fire on an `ineligible` disputed row. P2 rather than P1
because it needs a transient DB failure at a precise moment — but its consequence is money and it
has no recovery inside the product.

**Fix direction:** On `reassessError`, return the same shape the r9 fix added — a `warning` naming
that the signature is recorded but the verdict did not move, so the toast is red. Then make the
re-assessment reachable on its own: either drop the `signature_confirmed` short-circuit at `:53-55`
in favour of a "recorded already; re-assess" branch, or give `/admin/orders` a separate re-assess
action guarded the same way.

---

### P2 — The cron never cancels an order whose artist deleted their account, and its nudge tells the buyer we asked an artist who no longer exists

**Where:** `src/app/api/cron/fulfillment-windows/route.ts:194-201` and `:152-182`;
`supabase/migrations/00049_orders_survive_account_delete.sql:32-35`

**What happens:** An artist takes a $1,200 order, does not ship it, then deletes their account.
00049 deliberately keeps the order and sets `orders.artist_id` to NULL, so the row is still
`status = 'paid'`, `shipped_at IS NULL`, `is_pickup = false`, `refund_approved_at IS NULL` — it is
selected by the cron every night. The window passes and stage 1 stamps `platform_nudged_at`. The
artist notification is skipped (`if (artist?.profile_id)` at `:152`), but the buyer's bell and the
thread note fire regardless, both saying *"We have asked the artist to ship it or offer you a new
date"* (`:166`, `:179`). Nobody was asked. Five business days later stage 2 calls
`artistSpokeSince`, which returns **`true` at `:201`** because `artist?.profile_id` is undefined —
so the order counts as `waiting` and is never cancelled, on this run or any future one. The one
automated money-movement path in the product silently excludes precisely the orders that can never
be fulfilled by anyone.

**Why it's real:** I read the FK (`ON DELETE SET NULL` on `orders.artist_id`, 00049:32-35) and the
early return at `:199-201`, whose comment justifies the lenient direction as "the consequence of
being wrong here is cancelling a live sale" — true for a *read failure*, but a NULL artist is not a
failed read, it is certainty that no artist can ship. The disproof that keeps this at P2 and not
higher: the buyer is not stranded — `cancel-unshipped` does not consult the artist at all
(`route.ts:35-38` allows the buyer on `buyer_id` alone) and the "Cancel for a full refund" button on
`/orders` renders from `fulfillmentWindow` without touching `order.artist`, so a buyer who reads
their bell can self-serve. It is the safety net for the buyer who does not that has the hole, plus
a notification that states something untrue.

**Fix direction:** Separate "no artist" from "read failed" in `artistSpokeSince` — return `false`
when `artist?.profile_id` is missing but the read itself succeeded — and make stage 1's buyer copy
conditional on there being an artist to ask, saying the artist's account is closed and the order
will be cancelled and refunded instead.

---

### P2 — A rejected inspection leaves the admin row with no controls at all and a label that tells them to inspect a return they have already inspected

**Where:** `src/app/admin/orders/page.tsx:292, 326-360`;
`src/utils/orderReturns.ts:112-114`; `src/app/api/admin/orders/[id]/return/route.ts:78-98`

**What happens:** A change-of-mind return arrives visibly damaged. The admin records
`receive` with `outcome: 'rejected'`. D9/D13 say this deliberately blocks the settle and becomes a
support conversation — correct. But the row it leaves behind offers nothing: the Settle button is
hidden by `25fc3b9`'s new condition at `:292` (`returnBlocksSettlement` returns the rejected
message, which is truthy); "Require a return…" is hidden because a record exists (`:326`); "Received
& accepted" needs `shipped_back_at != null && received_at == null`; "Accept inspection" needs
`inspection_outcome == null`; and "Waive return" is explicitly hidden by `:352`
(`ret.inspection_outcome !== 'rejected'`). The only text rendered is
`ret.received_at ? 'Return received — inspect it'` at `:336` — which tells the admin to do the thing
they just did. Before `25fc3b9` the Settle button was at least present and its 409 surfaced the real
sentence ("Decide with support what the buyer is owed before settling"); now that message has no
way to reach a human.

**Why it's real:** I enumerated every control the row can render and every predicate gating it, in
the state `{received_at: set, inspection_outcome: 'rejected', waived_at: null}` — none render. The
server is not the constraint: the `receive` action has no CAS on `inspection_outcome`
(`return/route.ts:79-89`) so an overriding "accepted" would be accepted, and `waive` has no rejected
guard either (`:101-110`); it is only the UI that hides both. So this is a screen with a dead end
and a wrong label rather than a broken rule. Not P1 because no money is lost or wrongly moved and
support can act out of band.

**Fix direction:** Give the rejected state its own row copy — the `returnBlocksSettlement` string is
already written for a human, so render it instead of the "inspect it" label — and keep one
deliberate control on it (a re-inspect, or the waive with a reason other than "unnecessary") so the
documented "decide with support" outcome has somewhere to land.

---

## Appendix: minor

- `settleRefund.ts:160-164` writes `refund_reason`/`refund_initiated_by` with no `.select()` and no
  error check, and `approve-refund:85` has already written `refund_reason: 'change_of_mind'` on
  every artist-approved order, so the `.is('refund_reason', null)` guard is a no-op on exactly the
  orders the admin later settles under a different reason. r5's P2‑9 (reason disagrees with the
  money) and r9's appendix, both unchanged.
- The relist decision (`settleRefund.ts:232`) is computed from the row read at `:62`, before the
  gate, the Stripe calls and the close — so on a retry of a half-finished settle it is decided from
  a read that is minutes or hours stale. It cannot currently disagree (nothing a client can write
  moves those columns while the order is mid-settle), but it is the same "decided from a read that
  is not held" shape as r5's P2‑5.
- `admin/orders/page.tsx:292` calls `returnBlocksSettlement` with one argument, so the Settle button
  is offered on every order with no return record — including the ones P1‑2 above guarantees will
  409. `25fc3b9`'s own commit message ("a button that exists only to be refused is worse than none")
  is only half-applied.
- `admin/orders/page.tsx:104-110` still loads returns with `select('*').limit(500)`, unfiltered,
  unordered, error discarded; and `:95-103` discards the orders read's error too, so a failed read
  renders "No orders found." Unchanged from r9's appendix.
- `signature-confirmed:98` treats `assessProtection` returning `null` (order read failed) as "no
  failures", producing the same silent green toast as P2‑3 by a different route.
- `authorizeReturn`'s upsert (`lib/orderReturns.ts:79-95`) still carries only the authorisation
  columns, so re-authorising over a `waived`/`accepted`/`rejected` record leaves the old outcome in
  place. `25fc3b9` reduced reachability further by hiding the button when a record exists; the
  artist's `approve-refund` path can still reach it. r9's appendix, unchanged.
- `accept-ship-by:57` clears `platform_nudged_at` but not `proposed_ship_by`, so an order whose
  buyer accepted a new date that the artist then also missed is permanently invisible to both cron
  stages (`:101-104` and `:133`). r5's P2‑7, unchanged and now slightly wider, because the nudge
  stamp is cleared as well.
- The `messages.message_type` NULL case (`assessProtection:62`, cron `:227`) and the cron's
  25-cancel `break` skipping later stage‑1 nudges (`:109-115`) are both unchanged from r9's
  appendix.
- `orders.window_missed_at` still has no readers: written at cron `:137`, nulled by
  `accept-ship-by:57`, selected by nothing.
- `settleRefund` returns `refundedCents` computed from the *caller's* reason even on a retry that
  skips step 1 because `stripe_refund_id` is already set — so a retry with a changed reason reports
  and emails an amount that was not refunded. Harmless today: the only retrying caller
  (`cancelUnshipped`) always uses fault reasons, which produce identical amounts.

## Not findings

- **The `settleRefund` extraction.** Re-diffed line by line against
  `git show 0776480^:…/refund/route.ts`. Both idempotency keys (`refund_<id>`, `reversal_<id>`), the
  persist-immediately-after-each-Stripe-mutation retry design, the close CAS
  (`.neq('status','refunded')` with an asserted `.select('id').maybeSingle()`), the relist count
  matching `orders_one_live_per_listing` (00055), the `.eq('status','sold')` relist CAS, the
  500-character `admin_reason` truncation (moved from the route's parse to `:186`, identical on an
  empty string) and all five Sentry paths survive. Guards were added, never removed (null payment
  intent, `requireUnshipped`, `is_pickup`, the fail-closed return-gate read); the only reordering is
  `disputed` now checked before the approval check, which changes which of two 409 messages a
  disputed unapproved order gets and nothing else.
- **The `assessProtection` extraction.** `git show 7e9a6c9` moves the block byte-for-byte plus
  `export`; the only later change is `ef365e9`'s `.neq('message_type','system')`. The webhook's arc
  changes are the two columns added to the dispute-created select, the `signatureTodo` line, and
  `25fc3b9`'s `pieceIsWithArtist` swap at `:523`, which I checked selects `status` (`:494`) — the
  predicate needs it and would silently answer `false` without it.
- **Three callers, one refund.** No path double-refunds, double-reverses or double-relists. The
  close CAS admits exactly one caller past step 3 and the loser returns before any notification; the
  relist's `.eq('status','sold')` CAS admits one. What the keys do **not** protect: two doors with
  different reasons or different `note`/`refund_initiated_by` metadata send different bodies under
  the same key, which Stripe rejects and `settleRefund` reports as "safe to retry" (r5's P2‑3); and
  past 24 hours the key is gone and Stripe's unrefunded-amount ceiling plus the persisted
  `stripe_refund_id` are the real guard. The dispute-lost reversal uses `dispute_<id>` but bounds
  itself by `transfer.amount_reversed` before moving anything (`webhooks/stripe:940-949`,
  `disputeOutcome.ts:176-181`), so it cannot stack on a settled refund's reversal — I traced the
  settle-then-lose sequence and it reverses nothing.
- **The fault/change-of-mind arithmetic.** The fault branch is
  `amount + shipping + buyer_fee + amount_tax`, exactly the three checkout line items plus
  `total_details.amount_tax` — the whole charge, never more. The change-of-mind branch is strictly
  smaller by `buyer_fee + feeTax`, `Math.max(0, …)` covers the rounding edge, and the single
  `Math.round` costs the buyer at most a half-cent.
- **Settling a change-of-mind refund the artist never approved.** Refused at `settleRefund:112-119`.
  `refund_approved_at` has one writer (`approve-refund`, artist-gated, CAS on `IS NULL`) and is
  frozen for non-privileged writers (00066:58, the live body — `00067`–`00069` do not touch the
  function).
- **The window arithmetic.** Executed: `addBusinessDays` and `businessDaysBetween` are exact
  inverses over 3,360 cases, zero failures. The window is **not** missed on the promised day —
  `created_at 2026-08-03T12:00Z`, 5-day window → ship-by `2026-08-10`, deadline `2026-08-11T05:59:59.999Z`
  = 00:59 CDT on the 11th; the same fixed +6h lands at exactly 23:59:59 local in CST (checked
  2026‑11‑20 and 2026‑01‑05), so the boundary is never earlier than the artist's midnight, which is
  what the comment claims. The known disagreement is the other clock: shipping at 21:00 Houston on
  the promised day gives `businessDaysBetween = 6 > 5`, so requirement 1 fails while the cancel
  clock says on time — r7's P2‑4, re-confirmed by execution, open and not made worse.
- **The cron's select and its concurrency.** `status='paid'`, `shipped_at IS NULL`,
  `is_pickup = false`, `refund_approved_at IS NULL`, `created_at ASC`, `limit 200`, served by
  `orders_paid_unshipped_idx` (00062). It cannot cancel an order that shipped a moment ago
  (`requireUnshipped` is re-checked inside the same read the money decision is made from), one where
  the artist proposed a date (both stages short-circuit), one where the buyer accepted a date
  (`accept-ship-by` clears `platform_nudged_at` and `fulfillmentWindow` reads `agreed_ship_by`), or
  one where the artist replied with anything but a `system` message — and `postOrderSystemMessage`
  does write `message_type: 'system'` (`orderThread.ts:72`) and never throws, so the platform's own
  notes cannot make an artist look silent or abort the loop. Two concurrent runs are safe: stage 1
  is CAS-stamped, stage 2 converges on the close CAS. A partial failure mid-loop leaves the
  cancelled orders cancelled and the rest for tomorrow, and no supabase-js call in
  `cancelUnshippedOrder` throws, so one bad order cannot abort the run.
- **The return gate on a retry.** The gate is re-read on every call and sits above the reason write
  (`:146` before `:160`), so a retry re-passes it rather than skipping it. The one way a retry is
  wrongly *blocked* — an admin flipping `accepted` to `rejected` between the money and the close,
  which `receive` permits because it still has no CAS — is r5's P2‑4, unchanged. The gate's own read
  fails closed with a 503.
- **The signature route racing the dispute handlers.** Three disjoint CAS predicates: the signature
  route requires `status='disputed'` and CASes on `protection_status='ineligible'`; the created
  handler CASes on `.neq('status','disputed')`; the closed handler's late assessment CASes on
  `'pending'`. It only ever upgrades, only from `ineligible`, and every other input to the
  assessment is frozen once disputed. The ~1s window against the closed handler's own read
  (`webhooks/stripe:860` read, `:949` reversal, never re-read) is r6's appendix, unchanged and still
  UNVERIFIED — settling it needs the two handlers timed against a real delivery.
- **The three-state possession partition itself.** `pieceIsWithArtist` and
  `buyerTookPossession || pickupPossessionUnknown` do partition every state, and
  `orderReturns.test.ts:227-258` pins it. The defect is not the partition; it is that two callers
  feed it a third input (`piece_not_collected`) and three feed it only the columns — see P1‑2.
- **The manual relist path.** A refunded order releases the listing slot, and
  `api/listings/[id]/route.ts:77-90` then permits `sold → available` from the artist's edit page
  (`edit/page.tsx:276-288`). So P1‑2's missing relist is recoverable by the artist, which is why it
  is folded into that finding rather than raised as loss.
- **`order_returns` exposure and the guard.** db-smoke §14 asserts under `SET ROLE` (not JWT claims
  alone) that there is no client INSERT/UPDATE/DELETE grant, no `anon` SELECT, that both parties can
  read their own record, that an outsider cannot see the address, and that the buyer cannot accept
  their own inspection. db-smoke §6 pins every column `00060`/`00061`/`00062`/`00066` froze —
  `signature_confirmed_at`, `dispute_conceded_at`, `refund_reason`, `refund_initiated_by`,
  `proposed_ship_by`, `window_missed_at`, `platform_nudged_at`, `agreed_ship_by` — so
  CONVENTIONS' "database changes ship with the smoke test" is met by this arc.
- **The pickup no-money guards.** `settleRefund:89-96`, `cancel-unshipped:44-52` and the cron's
  `.eq('is_pickup', false)` are three independent stops on r6's P0.
- **`concede-dispute`** touches no money: artist ownership check, `disputed` status check, `.is(null)`
  CAS on a column no client can write (00060), and it is not read by `selectDisputeCloseOutcome`.
- **`return-shipped`** is the only client-reachable write on a return and it CASes on
  authorised-and-not-yet-shipped, so `shipped_back_at` is a server timestamp set at most once.
- **`propose-ship-by` / `accept-ship-by`** both CAS on `status='paid' AND shipped_at IS NULL` with an
  asserted `.select('id').maybeSingle()`, and `accept-ship-by` writes `agreed_ship_by` rather than
  widening `fulfillment_window_days`, so requirement 1 stays on the original promise (00066).
