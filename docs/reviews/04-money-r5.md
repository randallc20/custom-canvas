# Money & order lifecycle — review r5 (legal-alignment arc) — 2026-09-03

**Files read (opened in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`;
`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillmentWindow.ts`,
`src/utils/evaluateProtection.ts`, `src/utils/orderRecord.ts` (amount semantics only);
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`,
`.../return/route.ts`; `src/app/api/orders/[id]/approve-refund/route.ts`,
`.../cancel-unshipped/route.ts`, `.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`,
`.../return-shipped/route.ts`, `.../concede-dispute/route.ts`, `.../mark-delivered/route.ts`;
`src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` — the dispute-created and dispute-closed handlers
(600–1010) and the extraction diff, not the checkout/refund handlers;
`src/app/(user)/orders/page.tsx` and `src/components/studio/SalesSection.tsx` (the L7/L8
controls and copy), `src/app/admin/orders/page.tsx` (settle, return, signature controls);
`src/utils/refundSplit.test.ts`, `src/utils/orderReturns.test.ts`,
`src/utils/fulfillmentWindow.test.ts`, `src/utils/evaluateProtection.test.ts`;
migrations `00060`–`00064`; `git show 0776480` and `git show 7e9a6c9` for both extraction diffs.

**Partly covered, and why:** `scripts/db-smoke.sql` — §14 (returns) read in full; §6's new freeze
rows and §5's index pin verified by targeted grep; §10–§13 belong to 00058/00059/00063/00065 and
are outside the money slice, so I only confirmed §12 exists for the 00063 fix. I did not run the
vitest suite or db-smoke, and nothing below depends on running them.

**Verdict:** the two extractions are clean — `assessProtection` is byte-for-byte identical to the
webhook's inline version, and `settleRefund` preserved every guard, both idempotency keys, the
step-skipping retry, the close CAS, the relist rule and all four Sentry paths, adding two guards
rather than dropping any. The damage is at the seams the arc opened: a change-of-mind approval on
an order that has not shipped yet authorises a return for a piece the buyer never received and then
blocks every settle door, and `accept-ship-by` writes a calendar-day count into the column that
*is* the seller-protection bar — which three separate comments and a migration promise it does not
touch.

---

### P1 — Approving a refund on an order that has not shipped authorises a return for a piece the buyer never received, and then blocks every settle door
**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:37` (accepts `paid`), `:50-60`
(return address mandatory), `:83-89` (`authorizeReturn`); `src/utils/orderReturns.ts:36-45`
(`change_of_mind` → `required: true`); `src/lib/orderReturns.ts:53`, `:80`, `:99-142`;
`src/lib/settleRefund.ts:113-119`; `src/components/studio/SalesSection.tsx:400-413`,
`:426-491`; `src/app/(user)/orders/page.tsx:372-374`.

**What happens:** A buyer messages "sorry, please cancel this" on a `paid`, unshipped order. In
Studio › Sales the artist clicks **Approve refund** — the modal is unconditional, so it asks
"Where should they send it?" and the artist types their studio address. The route sets
`refund_approved_at` and `refund_reason: 'change_of_mind'`, then calls `authorizeReturn`, whose
`required` defaults from the reason to `true`. The buyer immediately gets a thread message, a bell
("Send *"Title"* back by September 10"), an email with the artist's street address, and a return
card on /orders with a seven-calendar-day ship-by clock — for a painting still on the artist's
wall.

Then nothing can settle it. The admin's **Settle refund** hits
`returnBlocksSettlement` and 409s with "This refund is conditioned on the artwork being returned."
The artist's own **Cancel order** button is still rendered (`SalesSection.tsx:344`, which checks
only `status === 'paid'`, not `refund_approved_at`) and goes to `cancelUnshippedOrder` →
`settleRefund` → the same 409. And if the fulfilment window then passes, the cron nudges, waits
five business days, calls `cancelUnshippedOrder`, gets the same 409, and logs a Sentry `error`
every night thereafter. The buyer's money moves only when an admin notices and clicks
**Waive return** (`unnecessary`).

**Why it's real:** I checked every place that could refuse this and none does.
`approve-refund` gates on `['paid','shipped','delivered']` and never looks at `shipped_at`;
`authorizeReturn` refuses only `status === 'refunded'`; `returnRequiredByDefault` keys on the
reason alone — its own test comment says "requires a return when the buyer has the piece", which is
the assumption `paid` breaks. The buyer's return card has no status filter, and the gate is
deliberately inside `settleRefund` (correct, per D9/D13) so all three doors close together. The
artist's address disclosure is a second consequence: D9's rule is that it is revealed "only after
authorisation", and here an authorisation was manufactured for a return that cannot exist.

**Fix direction:** In `approve-refund`, pass `required: false` (or skip `authorizeReturn`
entirely and skip the address requirement) when `shipped_at` is null — a pre-shipment
change-of-mind has nothing to return, which is what `returnRequiredByDefault` already says for
`artist_cancelled`. The cleaner shape is for the pre-shipment case to route the artist to
`cancelUnshipped` instead, since Artist Agreement §7 already calls that the artist's cancellation.

### P1 — `accept-ship-by` moves the seller-protection bar it says it does not move, and moves it in the wrong unit
**Where:** `src/app/api/orders/[id]/accept-ship-by/route.ts:42-52`;
`src/lib/assessProtection.ts:90`; `src/utils/evaluateProtection.ts:154-160`;
`src/app/api/webhooks/stripe/route.ts:780-808` and `:915-968`;
`supabase/migrations/00062_fulfillment_windows.sql` (the `proposed_ship_by` comment).

**What happens:** An artist misses the 5-business-day window on a $900 shipped-later piece and
proposes 1 October (order created 1 September). The buyer accepts. The route computes
`calendarDays = ceil((target − created)/86_400_000)` = 30 and writes
`fulfillment_window_days = 30`. Two things follow.

First, `fulfillment_window_days` is the *only* input to seller-protection requirement 1:
`assessProtection` reads it straight off the row and `evaluateProtection` fails requirement 1 when
`businessDaysBetween(createdAt, shippedAt) > fulfillmentWindowDays`. So the artist ships on 8
October — 25 business days late — and requirement 1 passes. If the buyer files a non-receipt
chargeback, `charge.dispute.created` freezes `protection_status: 'protected'`, and
`charge.dispute.closed` on a loss takes the `platformAbsorbs` branch: Custom Canvas eats the
chargeback and the artist keeps the payout. The artist bought protection back by asking for more
time — the exact outcome `propose-ship-by:30-33`, `accept-ship-by:18-21`, D-comment 00062 and the
buyer's and artist's cards all promise cannot happen.

Second, the unit is wrong even for the prompts it was meant to fix. 30 *business* days from 1
September is 13 October, so `fulfillmentWindow()` now shows the buyer and the artist "Ship by
October 13" — a date the buyer never agreed to, two weeks past the one they accepted — and the
cron will not look at the order again until then.

**Why it's real:** I grepped every reader of `fulfillment_window_days`: `assessProtection.ts:90`,
`ProtectionBadge.tsx:58`, `fulfillmentWindow.ts:37`, `cancel-unshipped:48`,
`cron/fulfillment-windows:68`. There is no separate protection-window column for requirement 1 to
fall back on, and `evaluateProtection` has no notion of an "original" window. The column is
snapshotted per order precisely so it cannot be rewritten after the sale
(`evaluateProtection.ts:31-34`), and this route rewrites it. The existing test
`fulfillmentWindow.test.ts:46-49` pins `fulfillment_window_days: 20` as the accept-ship-by
outcome, so the widening is intentional — its effect on requirement 1 was simply not noticed.

**Fix direction:** Record the consent somewhere that only the prompts and the cron read — the
existing `proposed_ship_by` plus an `accepted_at`, or a new `agreed_ship_by` column — and leave
`fulfillment_window_days` at its checkout snapshot so requirement 1 keeps measuring the original
promise. If the column must carry it, convert with `businessDaysBetween(created_at,
proposed_ship_by)` and give `assessProtection` the original 5 days explicitly.

### P2 — Three callers share one Stripe idempotency key but send different request bodies, so a cross-door retry after a lost persist is refused for 24 hours and reported as "safe to retry"
**Where:** `src/lib/settleRefund.ts:139-160` (metadata carries `refund_reason`,
`refund_initiated_by`, `admin_reason`; key `refund_${order.id}`), `:178-188` (the catch);
`src/lib/cancelUnshipped.ts:54`; `src/app/api/cron/fulfillment-windows/route.ts:103`;
`src/app/admin/orders/page.tsx:133`.

**What happens:** The buyer clicks **Cancel for a full refund** on an overdue order.
`stripe.refunds.create` succeeds with key `refund_<id>`, then the function dies before
`update({ stripe_refund_id })` lands (a Vercel timeout on the slow Stripe round-trip, a deploy, an
OOM). The buyer sees an error; the order is still `paid` with no refund id, and the buyer's money
is already back.

That night the cron picks the same order up and calls `settleRefund` with the same reason but
`initiatedBy: 'platform'` and `note: 'Auto-cancelled: …'`. The request body no longer matches the
one the key was minted with, so Stripe rejects it with an `idempotency_error` instead of replaying
the original refund. The catch has no `refundId`, so it returns *"Refund failed at Stripe — safe to
retry"* — and it is not safe or retryable, because every subsequent attempt from any door with any
other reason or note hits the same wall until the key ages out. Meanwhile the buyer has been
refunded, the artist's payout is not reversed, the listing is still `sold`, and the order still
reads Paid. Same shape between the admin door (whose note is `refundReasonLabel(reason)`) and
either of the other two, and worse when the reasons differ: a `change_of_mind` attempt pins the key
to the smaller amount, so the correct fault settle cannot be made at all.

**Why it's real:** Stripe binds an idempotency key to the full request payload and errors rather
than replaying when it differs; `metadata` is part of that payload, and all three callers vary
`refund_initiated_by` and `note` by construction. Before the extraction there was one caller whose
only variable was `admin_reason`, so this is new surface. The pre-persist window is exactly the one
the key exists to cover, and the design comment at `settleRefund.ts:25-28` says so — it just
assumes the retry comes from the same door.

**Fix direction:** Keep everything caller-varying out of the keyed request (put the reason, the
initiator and the note on the order row and in a `metadata` write after the fact), or handle
`err.code === 'idempotency_error'` by listing `stripe.refunds.list({ payment_intent })`, adopting
and persisting the existing refund id, and continuing from step 2 — the message must never say
"safe to retry" when a refund may already exist.

### P2 — The return gate is applied to a settle whose money has already moved, so a half-finished settle can be locked out of its own retry
**Where:** `src/lib/settleRefund.ts:113-119` (gate) versus `:133-177` (the step-skipping retry) and
`:184-187` ("RETRY to complete it").

**What happens:** An admin settles a `damaged` fault refund on a delivered order before any return
record exists. The gate passes (no record → `returnBlocksSettlement(null)` is null), the Stripe
refund is created and persisted, and the transfer reversal fails — 502, *"Buyer refunded, but the
artist payout reversal failed — RETRY to complete it."* Before the admin retries, the artist — who
is also being asked for a refund in the thread and whose **Approve refund** button is live on a
`delivered` order — clicks it. `refund_approved_at` is still null, so the CAS succeeds and a
`required` return record appears. The admin's retry now returns 409 "This refund is conditioned on
the artwork being returned": the buyer has their money, the artist keeps the payout, the order is
still `delivered`, and the two messages the admin has been given contradict each other with no
indication that the money already moved. Recoverable only by waiving a return that was legitimately
required.

**Why it's real:** I read the ordering rather than inferring it — the gate is at line 113 and the
`if (!refundId)` skip is at 138, so the gate runs on every attempt including the ones that have
nothing left to do but reverse and close. Nothing in the gate or the outcome type distinguishes
"do not start" from "finish what you started", and `status` is still `delivered` on a half-settled
order, so the `Already refunded` short-circuit does not catch it. The same shape is reachable
without the artist: the `receive` action has no CAS on `inspection_outcome`
(`admin/orders/[id]/return/route.ts:79-89`), so an accepted inspection can be flipped to
`rejected` between two attempts.

**Fix direction:** Skip the gate when `order.stripe_refund_id` is already set — the gate exists to
stop money moving, not to stop a moved refund being booked — and say so at the call site. Belt:
have the 502 messages carry the refund id so the admin knows what state they are in.

### P2 — `requireUnshipped` and the relist decision are made from a read that is not held, and the close CAS does not re-assert them
**Where:** `src/lib/settleRefund.ts:61-67` (the read), `:81-87` (`requireUnshipped`, comment: "so
it cannot be raced past"), `:194-201` (close CAS on `.neq('status','refunded')` only), `:209-253`
(relist keyed on the stale `wasShipped`); `src/components/studio/SalesSection.tsx:387-389`.

**What happens:** An order is overdue; both parties are looking at it. At 09:00:00.0 the buyer
clicks **Cancel for a full refund**; `settleRefund` reads the row at .1 (`paid`, `shipped_at`
null), passes `requireUnshipped`, and starts `stripe.refunds.create`. At 09:00:00.4 the artist
finishes the ship modal — **Mark as Shipped** is rendered for any `paid` order without
`refund_approved_at`, and the 00062 guard permits `paid → shipped` — so the row becomes `shipped`
with `shipped_at` stamped. The refund returns at ~09:00:01.2 and the close CAS, which asks only
that the status is not already `refunded`, succeeds. `wasShipped` was computed from the .1 read, so
it is false: the count check finds no other live order, the listing goes back to `available` with
`sold_price_cents` cleared, and the piece is in the post to a buyer who now has the whole charge
back including the service fee. The artist's payout is reversed and the artwork can be sold again.

**Why it's real:** The comment at `:52-57` claims the check is inside "the same read the money
decision is made from, so it cannot be raced past" — a read is not a lock, and the only write that
could enforce it (`:195-201`) drops the condition. `wasShipped` is derived from the same stale
snapshot rather than from the row the CAS returned. I confirmed the artist's write needs no server
route (00060's guard opens `paid/shipped → shipped` to non-privileged writers) and that the ship
button is not hidden on this path, because `cancel-unshipped` never sets `refund_approved_at` — the
04-r4 appendix fix only hides it after an *approval*. The window is sub-second, which is why this
is P2 and not P0; the outcome if it lands is a P0 outcome.

**Fix direction:** Add the decision's preconditions to the close CAS — `.eq('status','paid')
.is('shipped_at', null)` when `requireUnshipped` is set, otherwise `.eq('status', order.status)` —
and return the status/`shipped_at` from that write so `wasShipped` is derived from the row that was
actually closed, not the one that was read.

### P2 — The "ask" that starts the automated-cancellation clock is an in-app bell, sent best-effort and unchecked, after the stamp that starts the clock is committed
**Where:** `src/app/api/cron/fulfillment-windows/route.ts:118-133` (asserted stamp), `:135-165`
(three notices, none of whose results are read), `:76-104` (the stamp is the clock);
`src/lib/orderThread.ts:80-84` (swallows and reports); `src/lib/cancelUnshipped.ts:104-117`
(email only when `r.role === 'buyer'`).

**What happens:** The cron stamps `platform_nudged_at` with a proper CAS and asserts the row, then
tries to tell the artist. The notification insert's `{ error }` is never destructured, and
`postOrderSystemMessage` catches everything and returns void. So a notifications insert that fails
— a type-CHECK rejection after a future migration, a transient PostgREST error — leaves the clock
running with the artist never told. Five business days later the same cron cancels the sale,
refunds the buyer in full including the service fee, and reverses the artist's payout.

Even on the happy path the artist is only ever *belled*: there is no email anywhere in this route,
and `cancelUnshippedOrder` explicitly emails the buyer only. An artist who is away from the app for
a week — the population this path is designed to catch, and also the population that is simply on
holiday — is asked, judged unreachable, and has a sale cancelled and a payout reversed without a
single email. The Shipping policy's wording is "if we cannot reach the artist within five business
days of asking"; a bell nobody opened is not reaching, and the product emails the buyer at every
other step of the same flow (`propose-ship-by:132-141`, `authorizeReturn:133-142`,
`cancelUnshipped:109-117`).

**Why it's real:** I read all three notice paths. `postOrderSystemMessage` cannot throw, so the
loop is safe — which is also why nothing surfaces. CONVENTIONS §1 is about client-side writes, but
its principle ("silence is what this rule bans") is violated here on the write that decides whether
money moves, and this is the one route in the product where no human reads the outcome.

**Fix direction:** Read `{ error }` from the artist notification and, when it fails, roll
`platform_nudged_at` back (or refuse to advance to stage 2 without a recorded notice) so the clock
cannot start on an ask that was never delivered. Add an artist email to the nudge and to
`cancelUnshipped`, reusing the `sendShipByProposedEmail` pattern.

### P2 — Any `proposed_ship_by`, however stale, disables the automated path forever
**Where:** `src/app/api/cron/fulfillment-windows/route.ts:84-87` and `:116` (existence checks, not
date checks); nothing anywhere clears `proposed_ship_by`.

**What happens:** An artist misses the window and proposes 10 September. The buyer never responds
(most buyers do nothing). 10 September passes with no shipment. On every subsequent nightly run the
order matches the query, `elapsed > windowDays`, and then `if (o.proposed_ship_by) continue` —
stage 1 never nudges and stage 2 never cancels, forever. The order sits in `paid` with the buyer's
money held indefinitely, and the platform's own promise ("if we cannot reach the artist within five
business days of asking, we cancel the order and refund you") never fires for the artist who did
the one thing that switches the safety net off. The buyer can still cancel by hand — their right
stays open because `proposed_ship_by` is set — so this is a broken guarantee rather than a trap,
and it is only broken for buyers who wait to be looked after.

**Why it's real:** I grepped every writer of `proposed_ship_by`: `propose-ship-by` sets it and
nothing ever nulls it (`accept-ship-by:52` clears `window_missed_at` and `platform_nudged_at`, not
this). The comment at `:82-83` — "a proposed date the buyer has not acted on is still the artist
engaging" — is true on the day it is proposed and false a month later. `MAX_PROPOSAL_DAYS = 60`
bounds how far out the date can be, not how long the exemption lasts.

**Fix direction:** Treat the exemption as expiring: replace both checks with
`o.proposed_ship_by && new Date(o.proposed_ship_by) > now`, so a lapsed proposal drops back into
stage 1 and starts the nudge-and-cancel sequence against the date the artist actually offered.

### P2 — The buyer keeps an unconditional full-refund right after they have consented to the new date
**Where:** `src/app/api/orders/[id]/cancel-unshipped/route.ts:47-60`;
`src/app/(user)/orders/page.tsx:312-359`; `src/app/api/orders/[id]/accept-ship-by/route.ts:50-57`.

**What happens:** The artist proposes 20 September; the buyer clicks **Accept September 20**. That
extends the window, so the arithmetic no longer says the promise was missed — but the cancel gate
is `elapsed <= windowDays && !order.proposed_ship_by`, and `proposed_ship_by` is never cleared, so
the right stays open. The buyer's card still reads "It's your choice: accept the new date, or
cancel for a full refund" *after they accepted*, with the button next to it. On 5 September, with
the artist mid-frame, the buyer changes their mind and clicks it: the order is settled as
`not_shipped` — a **fault** refund — so the whole charge including the service fee goes back at the
platform's cost, the artist's payout is reversed without their approval, and the reason recorded
against the artist is that they failed to ship.

**Why it's real:** Artist Agreement §7 conditions the right on the buyer *not* agreeing ("If the
buyer does not agree to the new date, they may cancel"), and `accept-ship-by` exists precisely to
record that agreement — then leaves the flag that overrides it in place. The change-of-mind route
the documents intend here (ask the artist, fee retained, artist approves) is bypassed, and the
split is chosen by the door rather than by what happened.

**Fix direction:** Clear `proposed_ship_by` in `accept-ship-by`'s update (the acceptance is now
recorded in the window and in the thread), so the buyer's right re-opens only if the agreed date is
also missed. The buyer's card copy after acceptance needs the same correction.

### P2 — `refund_reason` can disagree with the money actually returned, and the buyer is shown the wrong sentence about their own refund
**Where:** `src/app/api/orders/[id]/approve-refund/route.ts:65-73` (pre-writes
`refund_reason: 'change_of_mind'`); `src/lib/settleRefund.ts:127-131` (writes only
`.is('refund_reason', null)`) versus `:122` (the split uses `opts.reason`);
`src/app/(user)/orders/page.tsx:247`; `src/app/admin/orders/page.tsx:294`.

**What happens:** The artist approves a refund (row now says `change_of_mind`, initiated by
`artist`). Support then establishes the piece never actually shipped, or arrived damaged, and the
admin settles with `not_shipped`. `settleRefund` prices the whole charge including the service fee
and its tax — correct — but its `refund_reason` write is a no-op because the column is already set,
and nothing reconciles the two. The row permanently records a change-of-mind refund. The buyer's
Orders page then renders `refundReasonLabel('change_of_mind')`: **"Refunded (change of mind —
service fee retained)"** for a refund in which their fee was returned in full. The admin queue
says the same, and any later accounting over `refund_reason` mis-classifies the platform's own
fault cost as a discretionary return.

**Why it's real:** `.is('refund_reason', null)` is deliberate (it protects the crash-forensics
value of the pre-Stripe write) but it makes the persisted reason first-write-wins while the money
is last-caller-wins. The same divergence hits `refund_initiated_by`. 00061 exists specifically so
that "`orders.refund_reason` records which it was", and D-note 2026-07-06 makes the label a
buyer-facing statement about money. Both readers were checked; both read the column, not the
refund.

**Fix direction:** After the Stripe refund succeeds, write the reason and initiator
unconditionally (they are frozen for non-privileged writers, so this is safe), keeping the
pre-Stripe `.is(null)` write as the forensic marker. Or have `settleRefund` refuse when a persisted
reason disagrees with `opts.reason`, and make the admin change it explicitly.

### P3 — For orders placed in the Houston evening, the window is "missed" at 7pm on the promised day
**Where:** `src/utils/evaluateProtection.ts:97-115` (`businessDaysBetween` normalises both ends to
UTC midnight) and `:125-135` (`addBusinessDays` preserves the time of day);
`src/utils/fulfillmentWindow.ts:38-42`, `:47-56`.

**What happens:** The two functions are exact inverses — I checked Monday-midday, Saturday and
weekend-straddling cases, and the boundary is right in the sense the tests pin it: with
`created_at` at 12:00Z, `missed` is false all through the promised day and true from the sixth
business day. But `missed` counts whole UTC days while the promise is displayed as a UTC calendar
date, so for an order created between 00:00Z and 05:00Z — 7pm to midnight in Houston, prime
consumer-purchase hours — the flag flips at 00:00Z of the following day, which is 7pm Houston **on
the date the buyer was shown**. The artist's card changes to "This is past its ship-by date" and
the buyer's **Cancel for a full refund** button appears five hours before the promised day is over
in the only timezone this marketplace operates in.

**Why it's real:** verified by hand: `created_at = 2026-08-04T02:00Z` gives
`shipByIso = 2026-08-11T02:00Z` → displayed "August 11"; `businessDaysBetween` reaches 6 at
`2026-08-12T00:00Z` = 11 August, 19:00 CDT. The test suite only exercises a midday `created_at`, so
it cannot see this. It errs *generous* overall — a Houston-local computation would have promised 10
August — so this is a consistency defect, not an unfair one, and it costs the artist at most an
evening.

**Fix direction:** Anchor both functions to the same civil day: normalise `created_at` to a
Houston-local date before counting, and treat the deadline as the end of that local day. One
timezone constant, and a test with a `created_at` in the 00:00–05:00Z band.

---

## Appendix: minor

- `src/utils/orderReturns.ts:87` — `waived_at` short-circuits before `required`, and nothing ever
  clears a waiver. An admin who waives (`unnecessary`) and later authorises a real return through
  `authorizeReturn`'s upsert leaves the gate permanently open: the buyer gets instructions and a
  clock, and the money can settle before the piece arrives.
- `admin/orders/[id]/return/route.ts:79-89` (`receive`) and `:101-110` (`waive`) have no CAS on
  `received_at` / `waived_at`, so both timestamps can be moved and `rejected` can be flipped to
  `accepted` by a second call. Deliberate for support, perhaps — but it is the one write that
  unblocks money.
- `cron/fulfillment-windows/route.ts:88` — `artistSpokeSince` counts any artist text message in the
  buyer↔artist thread, which is keyed by the participant pair, so a chat about a *different* piece
  marks the artist reachable and the abandoned order is never cancelled. Documented for
  requirement 6's leniency; here it silently disables the refund.
- Stage 2 of the cron has no CAS of its own (stage 1 does). Two concurrent runs both reach
  `cancelUnshippedOrder`; the Stripe keys and the close CAS make the money safe, but the loser
  emits `Refund close failed … zero rows` to Sentry as an error rather than resolving as a no-op.
- `settleRefund.ts:69` — a settle that closed the order but failed the relist returns 502
  "retry"; the retry then hits `Already refunded` → 400, so the listing stays `sold` with no live
  order and nothing ever relists it. Same shape as the pre-extraction route.
- `refundSplit.ts:109` — `reason` defaults to `change_of_mind`. All three money callers pass it
  explicitly today, so the default only ever silently under-refunds a future caller that forgets.
- `orders.window_missed_at` is written by the cron and cleared by `accept-ship-by`, and read by
  nothing.
- db-smoke §6 asserts the freeze on `signature_confirmed_at` but not `signature_confirmed_by`;
  §5 pins `orders_paid_unshipped_idx` (00062) but not `order_returns_open_idx` (00064).
- `cron/fulfillment-windows:56` — `.limit(200)` on `created_at ASC` is the right ordering (the
  oldest qualify first), but there is no signal if the page ever fills.

## Not findings

- **The `settleRefund` extraction.** Diffed against `git show 0776480`: every guard is present
  (404, `Already refunded` 400, `disputed` 409, the approval check, both Stripe idempotency keys,
  the persist-immediately-after-each-Stripe-mutation retry design, the `.neq('status','refunded')`
  close CAS with its asserted write, the relist count matching `orders_one_live_per_listing`, the
  `.eq('status','sold')` relist CAS, and all four Sentry paths including the info-level
  not-relisted message). The `disputed` check moved above the approval check — both are
  side-effect-free 409s. Two guards were *added*: `!stripe_payment_intent_id` → 409, and
  `requireUnshipped`. The 500-character `admin_reason` truncation survived, moved from the route
  into the lib. Nothing dropped, nothing reordered that matters.
- **The `assessProtection` extraction.** Byte-for-byte identical to the webhook's inline version
  (`git show 7e9a6c9`), including the "read failures degrade to replied" leniency and the deleted-
  party short-circuits. The webhook's order read correctly gained `signature_required` and
  `signature_confirmed` for the new admin notice; without them the notice would have never fired.
- **The fault/change-of-mind arithmetic.** `amount_cents` is the artwork price alone
  (`orderRecord.ts:154`) and the buyer's charge is price + shipping + fee + tax, so the fault
  branch returns exactly the charge and never a cent more; the change-of-mind branch retains
  exactly the fee plus its prorated tax, with `Math.max(0, …)` covering the rounding edge and the
  proration based on the correct three-line taxed base. The tests pin three worked examples and the
  round-to-zero case.
- **Settling a change-of-mind refund the artist never approved.** Refused at
  `settleRefund.ts:95-102`; `refund_approved_at` is frozen for non-privileged writers (00060/00061)
  and its only writer is `approve-refund`, artist-only with a `.is(null)` CAS.
- **Reaching the fault split from a buyer's door on an order that does not deserve it.**
  `cancel-unshipped` requires `status === 'paid' && !shipped_at`, and for the buyer additionally a
  missed window or a proposed date. The only softness there is the post-acceptance case, raised
  above.
- **Double-refund / double-reverse / double-relist across the three callers.** Two concurrent
  settles both call `refunds.create` with `refund_<order_id>`: identical bodies replay the same
  refund, differing bodies are rejected — either way one refund. `reversal_<order_id>` always
  carries the same `amount` (`artist_payout_cents`), so it always replays cleanly. The close CAS
  admits one winner and the loser returns before any notification, so no duplicate emails or
  thread messages. The relist is CAS'd on `status = 'sold'` and the count check excludes the order
  itself. What the keys do *not* protect is the differing-body case (P2 above) and anything more
  than 24 hours apart — for which the persisted `stripe_refund_id` / `stripe_reversal_id` are the
  real guard.
- **The signature-confirmation re-assessment racing the dispute-created CAS.** It CASes on
  `protection_status = 'ineligible'`; the created handler CASes on `.neq('status','disputed')` and
  writes `pending`→ its verdict; the closed handler's late assessment CASes on `'pending'`. Three
  disjoint predicates. And it cannot upgrade on grounds other than the signature: `tracking_number`
  and `carrier` are frozen once `status = 'disputed'` (00057), `delivered_at` is server-stamped
  only by `mark-delivered`, which requires `status = 'shipped'`, and a late reply cannot retroact-
  ively satisfy a lapsed requirement-6 window.
- **`guard_orders_update` across 00060–00062.** Mechanically diffed the 00057 body against the
  00062 body: purely additive, eight new freezes (`refund_reason`, `refund_initiated_by`,
  `proposed_ship_by`, `window_missed_at`, `platform_nudged_at`, `signature_confirmed_at`,
  `signature_confirmed_by`, `dispute_conceded_at`) and not one line of the transition matrix,
  money freeze, evidence freeze or `shipped_at` stamp lost. db-smoke §6 pins all but one of them.
- **`order_returns` exposure.** No client INSERT/UPDATE/DELETE grant, no `anon` SELECT, parties-only
  read policy, and the buyer's single legitimate write goes through `return-shipped` with a CAS on
  authorised-and-not-yet-shipped and a server timestamp. db-smoke §14 asserts all of it under
  `SET ROLE`, including that the buyer cannot accept their own inspection.
- **`addBusinessDays` / `businessDaysBetween` as inverses.** Verified by hand on midday, weekend
  and window-straddling inputs; `> windowDays` rather than `>=` means the window is not missed on
  the promised day, which is pinned by a test. The only crack is the evening-order timezone case
  raised as P3.
- **The seven-calendar-day return clock** (`RETURN_SHIP_BY_DAYS`, `now + 7 × 86_400_000`) is
  calendar days as §5 requires, and is the only window in the product that is.
- **`concede-dispute`** records a preference behind an artist ownership check, a `disputed` status
  check and a `.is(null)` CAS on a column no client can write, and touches no money path. Correct
  as described.
