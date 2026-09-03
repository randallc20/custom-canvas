# Money & order lifecycle — review r9 (legal-alignment arc) — 2026-09-03

**Files read (in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (D6/D7 and the D9/D10/D13 returns entry);
`docs/reviews/04-money-r5.md`…`-r8.md` and `01-auth-access-r3.md`…`-r6.md` (headings + every
finding, to avoid re-reporting); `git show --stat` and the money hunks of `9bfe0ff`, `f865b9d`,
`ef365e9`, `8d3d347`.

`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillment.ts`,
`src/utils/fulfillmentWindow.ts`, `src/utils/evaluateProtection.ts`,
`src/utils/artistRepliedInTime.ts`, `src/utils/disputeOutcome.ts`;
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`,
`.../return/route.ts`;
`src/app/api/orders/[id]/approve-refund/route.ts`, `.../cancel-unshipped/route.ts`,
`.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`, `.../return-shipped/route.ts`,
`.../concede-dispute/route.ts`, `.../confirm-pickup/route.ts`, `.../mark-delivered/route.ts`;
`src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` — `charge.refunded` (483–597) and
`charge.dispute.created/updated/closed` (599–1080) in full;
`src/app/api/payments/checkout/route.ts` (line items, `automatic_tax`, no promotion codes);
`src/services/orders.ts`, `src/types/order.ts`;
`src/app/admin/orders/page.tsx` (in full), `src/app/(user)/orders/page.tsx` (order card + return
block), `src/components/studio/SalesSection.tsx` (in full);
migrations `00060`, `00061`, `00062`, `00064`, `00066`, plus `00067`–`00069` checked only for
whether they redefine `guard_orders_update` (they do not — `00066` holds the live body);
`scripts/db-smoke.sql` §14 in full;
`git show 0776480^:…/refund/route.ts` (the pre-extraction route, diffed by hand against
`settleRefund`) and `git show 7e9a6c9` (the `assessProtection` extraction).

**Partly covered, and why:** `db-smoke.sql` §10–13 belong to acceptance, listing standards, signup
and DMCA (00058/00059/00063/00065) — outside the money slice, so headers only, plus the two
`dmca_substantiated_count` expectation lines `8d3d347` changed. `00063` read only for whether it
touches `orders`. I did not run vitest or db-smoke. I did execute `businessDaysBetween`,
`addBusinessDays` and `fulfillmentWindow`'s deadline standalone — 4,800 inverse cases and the
boundary probed hour by hour around the promised day; the arithmetic claims below rest on that
output, not on reading.

**Verdict:** Both extractions are still clean — I diffed `settleRefund` line by line against
`0776480` and `assessProtection` against `7e9a6c9`, and no guard, idempotency key, CAS or Sentry
path was dropped or reordered in a way that changes an outcome. The possession question looks
genuinely closed this round: `buyerTookPossession()` is now the single answer at both relist sites,
the return gate, `authorizeReturn` and the artist's modal, and I could not find a caller that still
decides it alone. What is left is on the two paths that got NEW code in `8d3d347` and `7e9a6c9`:
the signature re-assessment reads a requirement that keeps moving, so it can silently refuse the
upgrade it exists to grant; and the return control that was added is a separate button nothing
routes an admin to, so the fault path still settles with the buyer keeping the piece.

---

### P1 — Recording signature confirmation silently refuses to upgrade the order whenever any buyer message in the pair's thread has gone three business days unanswered, and the admin is told it worked

**Where:** `src/app/api/admin/orders/[id]/signature-confirmed/route.ts:89-109`;
`src/lib/assessProtection.ts:51-63`, `:98-102`; `src/utils/artistRepliedInTime.ts:44-58`;
`src/app/admin/orders/page.tsx:185-205`.

**What happens:** A $2,400 painting ships on day 3, tracking and carrier are on the order, the
artist marked it delivered, the listing had five photos and 400 characters of condition notes, and
the artist answered every message. Nobody has recorded signature confirmation yet — nobody can,
because only Custom Canvas writes it and only at dispute time. The buyer files a chargeback. The
`created` handler assesses immediately: requirement 4 is the sole failure, `protection_status` is
frozen as `ineligible`.

The buyer, unhappy and waiting on the bank, writes in Messages: *"so what happens now?"* The artist
does not answer — the dispute notification told them to send evidence to support@, not to reply in
the thread, and Custom Canvas's own notes in that thread are `message_type: 'system'` so they do not
count as a reply either. Three business days pass.

Support then works the runbook, opens the carrier's page, finds the signature event, and clicks
**Record signature confirmation**. The route stamps `signature_confirmed` and re-assesses. This time
`assessProtection` reads the message history *live*: requirement 4 now passes, but requirement 6
fails, because `artistRepliedInTime` measures the outstanding buyer message against **now**
(`artistRepliedInTime.ts:56-57`), and "now" is a week after the chargeback. `assessment.status` is
`ineligible`, so the `.eq('protection_status','ineligible')` write at `:93-97` never runs,
`reassessed` stays `null`, and the route answers `{ ok: true, protection_status: null }`. The admin
page ignores that field and toasts **"Signature confirmation recorded."** (`page.tsx:197`).

When the dispute closes as lost, `selectDisputeCloseOutcome` reads `protection_status = 'ineligible'`
(`disputeOutcome.ts:174`), `platformAbsorbs` is false, and `webhooks/stripe:951-956` reverses the
artist's payout — roughly $2,040 plus shipping — on an order that satisfied every requirement the
protection spec actually asks about the shipment.

**Why it's real:** I tried to argue this is only ever a no-op. It is not, in two ways. First, the
input really does move: everything else `assessProtection` reads is frozen once `status = 'disputed'`
(`00066:69-103` freezes tracking/carrier/delivered_at/evidence/window/pickup confirmations for
non-privileged writers, and `mark-delivered:31` and `confirm-pickup:48-53` both refuse a disputed
order under the service role too — I checked each) — requirement 6 is the *only* non-frozen input,
and it is the one the re-assessment cannot see has changed. Second, the reach is wider than "a
message about this dispute": `artistRepliedInTimeForOrder` finds conversations by the participant
**pair** (`assessProtection.ts:44-49`) and bounds messages only below, by `order.created_at`
(`:55`) — so a message about a completely different painting, sent by the same collector to the
same artist weeks after this order, degrades this order's requirement 6. r6 and r8 both looked at
this and both concluded "requirement 6 can only go true→false with time, so the re-assessment can
only ever be an upgrade". That is the correct observation and the wrong reassurance: true→false with
time is exactly what makes the upgrade unreachable in the case D7 built the route for. The route's
own comment says that without a re-assessment path "the runbook step telling an admin to do this
would be theatre"; on this path it is theatre with a success toast on top.

**Fix direction:** Assess requirement 6 as of the moment the dispute froze the order, not as of now
— `artistRepliedInTime` already takes an injectable `now`, so pass the dispute instant (the row has
`pre_dispute_status` written in the same statement; a `disputed_at` stamp would be cleaner) and
ignore messages after it, which is what "frozen evidence" means everywhere else in this handler.
Failing that, have the route return the assessment's `failures` when it declines to upgrade and
surface them in the toast, so an admin can see that the upgrade was refused and why.

---

### P1 — A fault refund on a piece the buyer is holding still settles with no return: `returnRequiredByDefault`'s `damaged`/`not_as_described` defaults are unreachable, and the settle modal never mentions a return

**Where:** `src/utils/orderReturns.ts:36-54` (the documented defaults) and `:93-95` (the gate);
`src/lib/orderReturns.ts:57-62` (the only caller of `returnRequiredByDefault`);
`src/app/api/orders/[id]/approve-refund/route.ts:99-105` and
`src/app/admin/orders/page.tsx:427-431` (the only two callers of `authorizeReturn`);
`src/lib/settleRefund.ts:130-147`; the settle modal at `page.tsx:447-520`.

**What happens:** A buyer reports that a $2,400 canvas arrived with a torn corner. Support opens
`/admin/orders`, clicks **Refund…** on the row, changes the reason from the pre-selected
"Never shipped" to **"Arrived damaged"**, sees the confirm text — *"Fault refund: the whole charge
goes back, service fee and tax included… Custom Canvas settles this whether or not the artist
agrees"* — and clicks through. `settleRefund` reads `order_returns`, finds no row,
`returnBlocksSettlement(null)` returns `null` by design, and the money moves: the whole charge back
including the service fee, the artist's payout reversed. `wasShipped` is true so the listing is
correctly not relisted. The buyer now has the painting and 100% of their money, and there is no
record anywhere that a return was owed, waived, or judged unnecessary.

`returnRequiredByDefault` says in so many words that `damaged` and `not_as_described` require a
return by default. Nothing on this path calls it.

**Why it's real:** r8 raised the *absence of a control*; `8d3d347` added one, so that half is fixed
and I am not re-reporting it. What I checked is whether adding the button made the default
reachable, and it did not. `returnRequiredByDefault` has exactly one caller in the repo
(`lib/orderReturns.ts:59`, the `??` fallback inside `authorizeReturn`), and both callers of
`authorizeReturn` skip that fallback for fault reasons: `approve-refund:101` hard-codes
`reason: 'change_of_mind'`, and the new admin modal always sends `required: true`
(`page.tsx:429`), which short-circuits the `??`. So the `damaged` and `not_as_described` arms of
that switch are dead code in production. On the enforcement side, `settleRefund`'s gate only reacts
to a record that already exists — it never asks "should there be one" — and the settle modal
(`:447-520`) renders the reason, the split, the fee line and the approval warning, and says nothing
about a return, on any reason. The only prompt in the product is a separate `Require a return…`
button further along the same table row, which an admin has to notice and click *before* settling.
r8's own fix direction named all three parts ("an Authorise-return control… **defaulted on for
`damaged` and `not_as_described`, and a line in the settle modal saying whether a return is on
record**"); one of the three shipped.

**Fix direction:** Make the settle path consult `returnRequiredByDefault(reason,
buyerTookPossession(order))` — either as a line in the settle modal that blocks the button until an
admin has authorised or explicitly declined a return, or as a refusal inside `settleRefund` when the
reason requires one and no `order_returns` row exists. `settleRefund` already selects everything
`buyerTookPossession` needs, so the server-side version is the cheaper and unwalkaroundable one.

---

### P2 — The new "Require a return…" control hard-codes `required: true`, which bypasses the possession check `9bfe0ff` added, and re-opens the unshipped-return deadlock on a different door

**Where:** `src/app/admin/orders/page.tsx:304-316` (the button's visibility) and `:427-431`
(`required: true`); `src/app/api/admin/orders/[id]/return/route.ts:65-76`;
`src/lib/orderReturns.ts:57-62`.

**What happens:** A buyer writes to support about a $1,800 order. Support opens `/admin/orders` and
finds the row — which shows only `#a3f9c2e1`, the buyer's name, the amount, `paid` and a date; there
is no title, no `shipped` state and no possession signal on the row at all. They click
**Require a return…**, leave the pre-selected reason at "Arrived damaged", type the artist's
address, and authorise. The order has never shipped.

`authorizeReturn` takes `opts.required ?? returnRequiredByDefault(...)`, so `required: true`
short-circuits the possession check entirely and writes a required return on a painting still on the
artist's wall. The buyer is emailed the artist's street address, gets a bell and a thread note
telling them to send back a piece they never received, and a seven-calendar-day clock starts. From
that moment every settle door 409s — the admin's own settle, the buyer's `cancel-unshipped` right,
and the cron's cancel all go through `settleRefund`'s gate — until an admin notices the "Awaiting
return" badge and waives it.

**Why it's real:** this is precisely the defect `9bfe0ff` fixed on the artist's path (r5's P1: "a
return for a piece still on the artist's wall… and then deadlocked the refund"). The fix lives in
`returnRequiredByDefault`'s `hasThePiece` parameter, and the new caller is the one call site that
never reaches it. I checked whether the route re-derives possession itself: it does not — it passes
`parsed.data.required` straight through, and `authorizeReturn`'s own `buyerTookPossession(order) ||
pickupPossessionUnknown(order)` computation at `:61` is discarded whenever `required` is supplied.
I also checked whether the UI gates the button on possession: `:304` gates only on
`!returns[o.id] && status !== 'refunded' && status !== 'pending'`, so it renders identically on a
`paid`/unshipped order and on a `delivered` one. Recoverable (the Waive button is right there), and
admin-only, which is why this is a P2 rather than a P1 — but the address has already been emailed by
then, and ruling D9 is explicit that the artist's address is revealed only when there is genuinely
something to send back.

**Fix direction:** Have the admin route compute the possession default the same way the artist's
path does and treat `required: true` as an override that must be justified — at minimum, refuse it
(or warn hard in the modal) when `buyerTookPossession(order)` is false, since a return for a piece
that never left the studio is not a thing the documents contemplate. Showing the order's shipped /
collected state in the modal would also stop the mis-click at source.

---

### P2 — r8's P1 was fixed at the cron only: the artist's "Cancel order" button still converts their own approved change-of-mind refund into a full fault refund, and the row keeps saying the fee was retained

**Where:** `src/components/studio/SalesSection.tsx:324` (the block's condition) and `:370-377`
(the button), versus `:413` (`Mark as Shipped`, which does carry the condition);
`src/app/api/orders/[id]/cancel-unshipped/route.ts:54-59`, `:81-88`;
`src/lib/settleRefund.ts:112-119`, `:155-159`; `src/app/(user)/orders/page.tsx:312-368`.

**What happens:** A buyer asks for a refund in Messages on day 2 of a $2,400 shipped-order sale that
has not been posted. The artist opens **Approve refund** in Studio. The order is unshipped and not
pickup, so `needsReturn` is false, no `order_returns` row is written, and the route stamps
`refund_approved_at` and `refund_reason = 'change_of_mind'`. Admins get the "Refund to settle" bell.
Nobody settles that week.

The artist comes back to Studio. The card still renders the whole L7 block, because `:324` is
`order.status === 'paid' && !order.is_pickup` with no `refund_approved_at` condition — including
**Cancel order**. They click it, reasonably: they have agreed to refund and nothing is happening.
`cancel-unshipped` sends `reason: 'artist_cancelled'`, which `isFaultRefund` treats as fault, so
`calculateRefundSplit` returns `amount + shipping + buyer_fee + amount_tax` — the whole charge,
service fee and its tax included, roughly $80 the platform hands back on a refund its own documents
say retains the fee. The reason write at `settleRefund:159` is `.is('refund_reason', null)`, so the
row keeps saying `change_of_mind`: the buyer's Orders page and the admin table both render
`refundReasonLabel('change_of_mind')` — *"Refunded (change of mind — service fee retained)"* — over a
refund where it was not.

**Why it's real:** I am raising a previously-reported item only because the fix was applied to one
of the three doors r8 named and the commit message claims only that one. `8d3d347`'s diff for
`SalesSection.tsx` is nine lines, all of them the `pieceNotCollected` reset at `:434-443`; `:324`
is unchanged, and r8's fix direction ended "hide the artist's Cancel-order button once they have
approved a refund, for the same reason Mark as Shipped is hidden" — the condition is literally
present two elements later at `:413`. The buyer's door at `(user)/orders/page.tsx:312` is the same
shape and is defensible on its own terms (Terms of Sale §3 gives them an independent full-refund
right once the window is missed); the artist's is not — they are undoing their own decision at the
platform's expense with no new fact having arrived. The `refund_reason` half is r5's P2 and stays
open; what makes it worth a line here is that the cron fix removed the automated route to this
outcome and left the manual one, so the label mismatch is now reachable *only* through a door a
human clicked.

**Fix direction:** Add `&& !order.refund_approved_at` to `:324`, matching `:413`, and refuse the
artist branch of `cancel-unshipped` when `refund_approved_at` is set with a message pointing at the
settle queue. Separately, drop the `.is('refund_reason', null)` predicate on the settle's reason
write, or make it `.neq('refund_reason', opts.reason)` — a row that records a split different from
the money that moved is worse than no record.

---

### P2 — A return that comes back without the buyer tapping "I've shipped it back" cannot be recorded as received and inspected; the only unblock is a waiver that says "unnecessary", which is false

**Where:** `src/app/admin/orders/page.tsx:328-350`;
`src/app/api/admin/orders/[id]/return/route.ts:78-98`;
`src/utils/orderReturns.ts:99-108`.

**What happens:** A change-of-mind return is authorised on a $1,800 canvas. The buyer packs it,
posts it, and replies in Messages with the tracking number instead of using the button on their
order — or drives it to the studio. `shipped_back_at` stays NULL. The piece arrives and the artist
confirms it is undamaged.

On `/admin/orders` the row shows "Awaiting return". The **Received & accepted** button only renders
when `ret.received_at == null && ret.shipped_back_at != null` (`:330`), and **Accept inspection**
only when `ret.received_at != null` (`:337`) — neither is reachable, because `received_at` is only
ever written by those same two buttons. The only control left is **Waive return** (`:344`), which
posts `waived_reason: 'unnecessary'`. Support clicks it to release the money, and the permanent
record of the one condition the documents put on the refund now says the return was unnecessary, on
an order where the piece did come back and was inspected.

**Why it's real:** the route supports the sequence the UI does not — `receive` CASes only on
`.not('authorized_at','is',null)` (`route.ts:87`), with no `shipped_back_at` requirement — so this
is a gate the page invented, not one the schema imposes. I checked whether the buyer can be relied
on to press the button: `return-shipped` is the only writer of `shipped_back_at`, it requires a
tracking number and carrier (`route.ts:8-11`), and `authorizeReturn`'s own instructions offer
"reply here with the tracking number" as an equal alternative (`lib/orderReturns.ts:73`,
`:124`) — so the flow explicitly invites the path that strands the record. The money outcome is
correct either way; what is wrong is that the audit trail for a §5 refund records the wrong reason,
and `waived_at` also silently un-blocks any *future* return authorised on the same order, since the
upsert never clears it.

**Fix direction:** Render **Received & accepted** whenever `received_at` is null and the return is
required, regardless of `shipped_back_at` — the route already accepts it. If the button order
matters, keep "Return in transit" as a badge but do not let it gate the control.

---

## Appendix: minor

- `settleRefund.ts:65` adds `delivered_at` to the select and never reads it; `buyerTookPossession`
  keys on `status === 'delivered'`, not the stamp. Harmless today (the two cannot disagree once
  `disputed` is refused at `:74`), but the webhook's version at `:522-526` uses `|| !!delivered_at`
  as an explicit belt and `settleRefund` does not.
- `admin/orders/page.tsx:105` loads returns with `select('*').limit(500)` — no filter, no order, and
  the error is discarded. A failed or truncated read shows `Require a return…` on orders that
  already have a record and hides the "Awaiting return" badge on the ones the gate is holding. Fails
  closed (the server gate still 409s), so it is a confusing screen, not lost money.
- `admin/orders/page.tsx:290` still pre-selects `not_shipped` — a fault reason, the whole charge —
  for every order the artist has not approved, including a `delivered` one. Unchanged since r8's
  appendix; now slightly more load-bearing, because it is also the reason an admin has to change
  before P1‑2 above becomes relevant.
- `webhooks/stripe:830-833`'s `signatureTodo` still has no `is_pickup` check, so a disputed local
  pickup order tells the admin to open a carrier tracking page. Unchanged from r8's appendix.
- `settleRefund.ts:155-159`, `:187`, `:203` are still unchecked `.update()`s with no `.select()` —
  the three writes the crash-safety design depends on, including the one whose comment says it
  exists so a crash "leaves a row that says what was being done".
- `authorizeReturn`'s upsert (`lib/orderReturns.ts:79-95`) still carries only the authorisation
  columns, so re-authorising over a `waived` or `accepted` record leaves the gate open for the new
  one. The new admin button hides itself when a record exists, which *reduces* reachability to
  direct API calls — noted so the next change to that modal does not undo it.
- `messages.message_type` is nullable and both `.neq('message_type','system')` filters
  (`assessProtection:62`, cron `:227`) drop a NULL-typed row. No writer in `src/` produces one, so
  still latent.
- The cron's 25-cancel `break` (`:109-115`) still skips stage-1 *nudges* for every later order in
  the run; `:124-127` still logs Sentry `'error'` for the benign "shipped between the read and the
  settle" case. Both from r6's appendix, unchanged.
- `orders.window_missed_at` still has no readers: written at `:137`, nulled by `accept-ship-by:57`,
  selected by nothing that uses it.

## Not findings

- **The `settleRefund` extraction.** Diffed by hand against `git show 0776480^:…/refund/route.ts`.
  Both idempotency keys (`refund_<id>`, `reversal_<id>`), the persist-immediately-after-each-Stripe-
  mutation retry design, the close CAS (`.neq('status','refunded')` with an asserted
  `.select('id').maybeSingle()`), the relist count matching `orders_one_live_per_listing`, the
  `.eq('status','sold')` relist CAS, the 500-character `admin_reason` truncation (moved from the
  route's parse into `:181`, same effect on an empty string) and all five Sentry paths survive.
  Guards were **added** (null payment intent, `requireUnshipped`, `is_pickup`, and now a fail-closed
  return-gate read); `refund_initiated_by` was added to the Stripe metadata. The one semantic
  difference I found is cosmetic: `initiatedBy` is now computed from a second, separate read in the
  route (`refund/route.ts:42-51`) rather than from the transaction's own read, so a `refund_approved_at`
  written between the two reads would label the refund `platform` instead of `artist`. It changes a
  metadata string and a notification, never a cent.
- **The `assessProtection` extraction.** `git show 7e9a6c9` moves the block byte-for-byte out of the
  webhook plus `export`; the only later change is `ef365e9`'s `.neq('message_type','system')` line.
  The webhook's own arc changes are exactly the three the brief names: the two columns added to the
  dispute-created select, the `signatureTodo` notification, and `8d3d347`'s `buyerTookPossession`
  in `charge.refunded`.
- **Three callers, one refund.** No path double-refunds, double-reverses or double-relists. Two
  concurrent settles with the same reason send byte-identical bodies so Stripe replays one refund;
  `reversal_<id>` always carries `artist_payout_cents` so it always replays; the close CAS admits
  exactly one caller past step 3 and the loser returns before any notification. What the keys do
  **not** protect: two doors with different reasons send different bodies under the same key, which
  Stripe rejects and `settleRefund` reports as "safe to retry" (r5's P2); and past 24 hours the key
  is gone and Stripe's unrefunded-amount ceiling plus the persisted `stripe_refund_id` are the real
  guard. The dispute-lost reversal uses a different key (`dispute_<id>`) but bounds itself by
  `transfer.amount_reversed` before moving anything (`webhooks/stripe:942-949`), so it cannot stack
  on a settled refund's reversal.
- **The relist decision.** Both sites now use `buyerTookPossession()`, and I traced every caller's
  select: `settleRefund:65`, `webhooks/stripe:494`, `lib/orderReturns.ts:46`, `approve-refund:29`
  and the client `Order` type (`services/orders.ts` selects `*`) all fetch `shipped_at`, `is_pickup`,
  `status` and both confirmation columns. The predicate's parameters are all optional, so a caller
  that forgot a column would silently get `false` — none does today, and that is the thing to check
  first next time.
- **The fault/change-of-mind arithmetic.** `refundAmount` on a fault reason is
  `amount + shipping + buyer_fee + amount_tax`, which is exactly the three checkout line items
  (`checkout:113-140`) plus `total_details.amount_tax` — the whole charge, never more. I also
  checked for a way to make the sum exceed the charge: `allow_promotion_codes` is not set and no
  `discounts` are passed, so there is no coupon path that would leave `amount_paid` below the line
  items. The change-of-mind branch is strictly smaller by `buyer_fee + feeTax`, `Math.max(0, …)`
  covers the rounding edge, and the single `Math.round` can cost the buyer at most a half-cent.
- **Settling a change-of-mind refund the artist never approved.** Refused at `settleRefund:112-119`;
  `refund_approved_at` has one writer (`approve-refund`, artist-gated, CAS on `IS NULL`) and is
  frozen for non-privileged writers in `guard_orders_update` (00066:58). `00066` is the last
  definition of that function — `00067`–`00069` do not touch it.
- **The return gate on a retry.** The gate is re-read on every call and sits *above* the reason
  write (`:130-147` before `:155`), so a retry of a half-finished settle re-passes it rather than
  skipping it. The one way a retry is wrongly *blocked* — an admin flipping `accepted` to `rejected`
  between the money and the close, which `receive` permits because it still has no CAS — is r5's P2,
  unchanged. The gate's own read now fails closed with a 503.
- **`addBusinessDays` and `businessDaysBetween` are exact inverses.** 960 start instants across every
  weekday and hour × window lengths 1/3/5/10/20 — 4,800 cases, zero failures, including weekend
  starts (`addBusinessDays(Sat, 5)` lands Friday and `businessDaysBetween` agrees).
- **The window is NOT missed on the promised day.** Executed: `created_at = 2026-08-03T12:00Z`, 5-day
  window → ship-by `2026-08-10`, deadline `2026-08-11T05:59:59.999Z`. `missed` is false at
  23:59 CDT on August 10 and at 00:59 on the 11th, true from 01:00. The deadline errs up to an hour
  in the artist's favour, which is what the comment claims. The known disagreement is the other
  clock: shipping at 23:00 Houston on the promised day gives `businessDaysBetween = 6 > 5`, so
  requirement 1 fails while the cancel path says on time — r7's P2‑4, confirmed by execution, open
  and not made worse.
- **The cron's select and its concurrency.** `status='paid'`, `shipped_at IS NULL`,
  `is_pickup = false`, `refund_approved_at IS NULL`, `created_at ASC`, `limit 200`, served by
  `orders_paid_unshipped_idx`. It cannot cancel an order that shipped a moment ago
  (`requireUnshipped` is re-checked inside the same read the money decision comes from), one where
  the artist proposed a date (both stages short-circuit on `proposed_ship_by`), one where the buyer
  accepted a date (`accept-ship-by` clears `platform_nudged_at` and `fulfillmentWindow` reads
  `agreed_ship_by`), or one where the artist replied with anything but a `system` message. Two
  concurrent runs are safe: stage 1 is CAS-stamped (`:139-141`) and stage 2 converges on the close
  CAS, with the loser returning before any notification. A partial failure mid-loop leaves the
  cancelled orders cancelled and the rest for tomorrow. The one narrow gap: neither the stage-1
  stamp nor stage 2 re-asserts `refund_approved_at IS NULL`, so an artist who approves a refund
  during the run's own loop can still be cancelled at `not_shipped` — seconds wide, and I could not
  make it more than that.
- **The signature route racing the dispute-created CAS.** Three disjoint predicates: the signature
  route requires `status='disputed'` and CASes on `protection_status='ineligible'`; the created
  handler CASes on `.neq('status','disputed')`; the closed handler's late assessment CASes on
  `'pending'`. It cannot upgrade wrongly — every other input is frozen once disputed, verified above
  — and it never downgrades. The r6 appendix's ~1s window against the closed handler's own read
  (`webhooks/stripe:860` read, `:951` reversal, never re-read) is unchanged and still UNVERIFIED;
  settling it needs the two handlers timed against a real delivery.
- **`order_returns` exposure.** db-smoke §14 asserts under `SET ROLE` (not JWT claims alone) that
  there is no client INSERT/UPDATE/DELETE grant, no `anon` SELECT, that both parties can read their
  own record, that an outsider cannot see the address, and that the buyer cannot accept their own
  inspection.
- **The pickup no-money guards.** `settleRefund:89-96`, `cancel-unshipped:44-52` and the cron's
  `.eq('is_pickup', false)` are three independent stops on r6's P0.
- **`concede-dispute`** touches no money: artist ownership check, `disputed` status check, `.is(null)`
  CAS on a column no client can write (00060), and it does not feed `selectDisputeCloseOutcome`.
- **The client/server disagreement on `needsReturn`.** `SalesSection`'s modal computes it from a
  cached order object, but `approve-refund:61-63` recomputes from a fresh read and 400s with
  `return_address_required` when the client under-estimated. The only asymmetry is safe: a client
  that over-estimates sends an address the route ignores.
