# Money & order lifecycle — review r13 (legal-alignment arc) — 2026-09-03

**Files read:**

- `git show 6f6db0f --stat`, then the commit in full: the message, the
  `orders/page.tsx` hunk, the `AuthContext.tsx` hunk, and
  `git show 6f6db0f -- src/lib/settleRefund.ts src/utils/latestOnly.ts` for the two hunks the
  first read truncated. The r12 report shipped inside the commit was read in full, including its
  appendix and "Not findings".
- `src/lib/settleRefund.ts` at HEAD, three passes: once against the diff, once tracing
  `alreadyRefunded` / `owedToBuyer` / `refundId` through every branch, once on steps 2 and 3
  alone (the reversal is the least-recently-audited code in the file and was read cold).
- `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts` (the `authorizeReturn` half),
  `src/utils/orderReturns.ts`, `src/utils/refundSplit.ts`, `src/utils/fulfillment.ts`,
  `src/utils/fulfillmentWindow.ts`, `src/utils/reconcileStripe.ts` — all in full.
- `src/app/api/orders/[id]/cancel-unshipped/route.ts`, `accept-ship-by/route.ts`,
  `approve-refund/route.ts` in full; `propose-ship-by`, `confirm-pickup`, `notify-shipped`,
  `mark-delivered`, `return-shipped`, `concede-dispute` and the three
  `src/app/api/admin/orders/[id]/` routes checked against r12's write-ups rather than re-derived
  (see "Skipped").
- `src/app/api/admin/orders/[id]/refund/route.ts` in full and
  `src/app/admin/orders/page.tsx:100-170` (the settle handler and its confirm dialog).
- `src/app/api/cron/fulfillment-windows/route.ts` twice, including `artistSpokeSince`.
- `src/app/api/webhooks/stripe/route.ts`: the event case list, `charge.refunded` in full
  (`:483-596`), and the oversell tail above it. `src/app/api/payments/checkout/route.ts` and
  `src/utils/orderRecord.ts:60-175` to settle "one payment intent, one order".
- BOTH order cards in full: `src/app/(user)/orders/page.tsx` (handlers `:85-190`, card body
  `:212-483`) and `src/components/studio/SalesSection.tsx:300-470`.
- `src/lib/settleRefund.test.ts` (fixture + the whole "one order, one refund" block),
  `src/context/AuthContext.tsx` and `src/utils/latestOnly.ts` at HEAD.
- `scripts/db-smoke.sql` §6 and §14; `grep refund_approved_at supabase/migrations/`.
- `docs/CONVENTIONS.md`, `docs/POST-LAUNCH-BACKLOG.md` in full; every `### P` heading in
  `04-money-r5.md` … `-r12.md` and `01-auth-access-r3.md` … `-r9.md`, plus the full text of
  r12's two P1s.

**Skipped, and why:** `src/utils/evaluateProtection.ts` was opened only for
`addBusinessDays`/`DEFAULT_FULFILLMENT_WINDOW_DAYS`, which is all `fulfillmentWindow` consumes;
its boundary disagreement with the `+6h` ship-by is backlog #6 and I did not re-derive it.
`propose-ship-by` and the admin `return`/`signature-confirmed` routes were checked for
`refund_approved_at` handling and against r12's findings rather than read line by line — r12
covered them a day ago and `6f6db0f` ships no route change at all. `README.md`/`DECISIONS.md`
were not opened; the prompt's settled list plus `CONVENTIONS.md` covered every product decision
I needed. I ran nothing: no app, no `db-smoke`, no vitest, no Playwright (a suite holds :3000).

**Verdict:** The top-up arithmetic is, as far as I can break it, correct — I walked all six
paths the prompt names plus three of my own and could not make it double-refund or leave the
buyer on the wrong total by more than a failed-refund edge. The damage this round is once again
at the edge of the fix rather than its centre, and once again on the buyer's card: restoring the
cancel button was right, but nothing was done about *which split it settles under*, so the
button — and the new sentence written to advertise it — turns every artist-approved
change-of-mind refund that outlives its ship-by date into a full fault refund, which is the
exact conversion r8 and r10 already ruled a defect at the other two doors.

---

### P1 — The restored buyer cancel button settles as `not_shipped`, so every artist-approved change-of-mind refund that outlives its ship-by date is converted into a full FAULT refund — the service fee and its tax handed back — and the new sentence added by `6f6db0f` tells the buyer to do it

**Where:** `src/app/(user)/orders/page.tsx:343-361` (the new refund-approved sentence, `win.missed`
branch) and `:388-408` (the retained `Cancel for a full refund` button) →
`src/app/api/orders/[id]/cancel-unshipped/route.ts:69-80` (the buyer's door is deliberately left
open when `refund_approved_at` is set) and `:108` (`reason: isBuyer ? 'not_shipped' : …`) →
`src/utils/refundSplit.ts:55-57,114-134`. Against
`src/components/studio/SalesSection.tsx:339-347`, which is what the artist is looking at in the
same state.

**What happens:** buyer orders a $521 piece on 1 September; the window is five business days, so
the ship-by is 8 September. On 10 September they message the artist and ask for a refund. The
artist approves it: `approve-refund` writes `refund_approved_at` and `refund_reason =
'change_of_mind'`, writes an `order_returns` row with `required: false` (nothing shipped, so
`buyerTookPossession` is false), and drops a "Refund to settle" bell on every admin. Settling is
manual, so the order now sits `paid` in the admin queue.

The artist's card says, in the platform's own voice: *"You approved a refund on this order, so
the shipping promise no longer applies — don't ship it. Custom Canvas is settling the payment."*
Their Mark-as-Shipped button is gone (`SalesSection.tsx:434`). The piece is not going to move,
because the product told them not to move it.

`fulfillmentWindow` does not know any of that — it reads `created_at + fulfillment_window_days`
and `shipped_at IS NULL` — so `win.missed` is already true on the day of approval. The buyer's
card therefore renders the new branch: *"The artist approved your refund and we're settling it —
don't expect this to ship. **It's also past the 8 September ship-by date, so you can cancel it
yourself here for a full refund including the service fee.**"* — directly above a live
**Cancel for a full refund** button.

A buyer who presses it is strictly better off, and the copy tells them so. `cancel-unshipped`
takes the buyer branch, skips the `isArtist && refund_approved_at` refusal by design, and calls
`cancelUnshippedOrder` with `reason: 'not_shipped'` — a FAULT reason. `calculateRefundSplit`
therefore returns the whole charge instead of the change-of-mind figure: on the test fixture's
own numbers that is 2821¢ instead of 2706¢, and the difference is exactly `buyer_fee_cents +
feeTax` (106 + 9). The artist's payout is reversed either way and the platform returns its
commission either way, so the delta is money the platform keeps on one path and pays on the
other. It is not neutral money: the buyer fee exists to cover Stripe's processing fee, and Stripe
does not return its fee on a refund — the webhook's own oversell copy says so
(`webhooks/stripe:460`, "Stripe keeps its fee"). The tax on the fee, which the platform remits as
merchant of record, goes back too.

Then the telling. `settleRefund` overwrites `refund_reason` to `not_shipped`, so the buyer's own
card will read "Refunded in full — the piece was never shipped". `cancelUnshipped:76` posts into
the shared thread *"The buyer cancelled this order for X because it was not shipped within the
promised window"*, and `:94` notifies the artist *"The order for X was cancelled and refunded in
full because it was not shipped within the promised window. Your payout for it has been
reversed."* The artist is recorded and told they missed a shipping promise on the one order where
the platform's own UI instructed them not to ship.

**Why it's real:** I went looking for the innocent explanation twice.

*Is it just Terms §3?* §3 does grant the buyer a unilateral cancel on a missed window, and r12
was right that the button had to come back — I am not arguing the door should close. But the
identical conversion has already been ruled a defect at both of the other doors, for exactly this
reason. r8's P1: "The cron converts an artist-approved change-of-mind refund into a full fault
refund, returns the service fee, and tells both parties the artist was unreachable" — fixed with
`.is('refund_approved_at', null)` at `fulfillment-windows:68`. r10's P2: "the artist's 'Cancel
order' button still converts their own approved change-of-mind refund into a full fault refund"
— fixed with the refusal at `cancel-unshipped:72`, whose own comment states the principle:
*"cancelling here would refund the buyer more than the approval agreed to."* That sentence is
true of the buyer's branch word for word. The buyer's door is the third instance of a class
closed twice; it was invisible while r11/r12 had the block hidden, and `6f6db0f` both restored it
and wrote copy that sells it.

*Is it rare?* No — it is the ordinary shape. The refund conversation almost always happens after
the piece has sat for a few days, and the ship-by is only five business days from checkout, so
`win.missed` is usually already true at the moment of approval. Nothing has to stall for this to
fire; the button is live the instant the artist clicks Approve.

*Does anything downstream catch it?* No. `refund_reason` has no consumer beyond
`refundReasonLabel` and the admin filter (I grepped every file that references it), so the
mislabel is invisible to Sentry, to the reconcile cron and to any report.

**Both cards together** (the prompt's other question, and the same defect): in this state the
artist reads "the shipping promise no longer applies" while the buyer reads that the missed
shipping promise entitles them to a bigger refund. Neither card mentions the other's sentence.
The artist has no indication that the buyer's cancel door is open, no ship-by date, and no way to
stop the conversion — their only two buttons were removed by `59c5c9b`.

**Fix direction:** keep the door open and stop the split from upgrading — when
`refund_approved_at` is set, the buyer's branch of `cancel-unshipped` should settle under the
reason the approval agreed to (`change_of_mind`, which `settleRefund` will now accept because
`refund_approved_at` is present) rather than `not_shipped`, and the card's sentence should offer
"cancel now instead of waiting for us" without promising the service fee. If the ruling is that
§3 really does upgrade the split, then the artist's card has to say so before they approve, and
the approval modal should price it.

**Severity note:** P1 and not P0 because the loss per occurrence is bounded to the service fee
plus its tax and needs a buyer to press a button. If you read "the product's own copy instructs
the buyer to take the larger refund" as automatic enough, upgrade it — it is not a corner case,
it is the default path.

---

### P2 — The refund-approved branch nulls `proposed`, so the buyer loses the cancel button in the one state `cancel-unshipped` grants it without a missed window — and the comment that justifies not widening it misdescribes the route

**Where:** `src/app/(user)/orders/page.tsx:333` (`const proposed = order.agreed_ship_by ||
refundApproved ? null : order.proposed_ship_by;`), `:334-340` (the comment and `canCancel =
win.missed || !!proposed`) against `src/app/api/orders/[id]/cancel-unshipped/route.ts:88-98`.

**What happens:** on day 4 of a five-business-day window the artist presses "Can't ship in time"
and proposes 20 September; `proposed_ship_by` is set, `agreed_ship_by` is not. The buyer, rather
than accepting, asks for a refund in Messages and the artist approves it. The order is now
`refund_approved_at` set, `proposed_ship_by` set, `agreed_ship_by` null, `win.missed` false — the
original ship-by has not passed yet.

The card computes `proposed = null` (because `refundApproved`), so `canCancel = win.missed =
false` and **no button renders**. The sentence says "If it hasn't moved by 8 September, you can
cancel it yourself here without waiting for us." But the route would accept the call right now:
its buyer branch is `if (!win.missed && !openedByProposal) 409`, and
`openedByProposal = !!order.proposed_ship_by && !order.agreed_ship_by` is true. The buyer is told
to wait for a right they already hold, on the one order where both parties have already agreed
the sale is over.

**Why it's real:** the comment added at `:334-339` states the premise for the decision —
*"the route only grants the buyer's cancel once the window is actually missed (cancel-unshipped,
buyer branch)"* — and that is not what the buyer branch says; `openedByProposal` is the second
half of the condition and it exists precisely because r5's P2 ruled that an unanswered proposal
is itself an admission the window was missed. I checked for a second door and there is none:
`cancelForRefund` is called from `:404` only, inside this block, and the `['paid','shipped',
'delivered']` block at `:468` offers a sentence rather than a button once `refund_approved_at`
is set. The wait is bounded (the original ship-by arrives on its own), which is why this is P2
and not P1 — but the reasoning written into the file is wrong, and the next person to touch this
block will trust it.

**Fix direction:** compute `canCancel` from the route's own two conditions —
`win.missed || (!!order.proposed_ship_by && !order.agreed_ship_by)` — and keep the separate
`proposed` variable purely for whether to render the *Accept* button. Correct the comment while
you are there.

---

### P2 — `alreadyRefunded` counts `pending` refunds, so a refund that later fails leaves the buyer permanently short on an order the product has already closed as fully refunded

**Where:** `src/lib/settleRefund.ts:279-282` (`live` excludes only `failed` and `canceled`; the
sum feeds `owedToBuyer` at `:314`) against `src/app/api/webhooks/stripe/route.ts` (the event
switch has no `charge.refund.updated` case) and `src/utils/reconcileStripe.ts:85`
(`stripeRefunded = charge.refunded || charge.amount_refunded > 0`).

**What happens:** a $200 refund exists on the payment intent in `pending` — a Dashboard goodwill
refund issued minutes earlier, or the platform's own refund from a settle whose close failed. An
admin settles a `not_shipped` refund on the $521 order. `alreadyRefunded` is 200, so the top-up
creates $321, the reversal runs, and the order closes as `refunded` and relists. The pending $200
then fails at the network — a closed or expired card is the ordinary cause — and Stripe returns
those funds to the platform balance. The buyer has had $321 back on an order the product, their
own Orders card, and the artist's card all describe as refunded in full.

Nothing looks again. There is no `charge.refund.updated` handler, so the failure never reaches
the app. The nightly reconcile compares `charge.amount_refunded > 0` against `status ===
'refunded'` — Stripe decrements `amount_refunded` when a refund fails, but $321 is still greater
than zero, so both sides agree and no mismatch is pushed. The only trace is the `'info'` Sentry
breadcrumb written at `:301`.

**Why it's real:** I tried to argue the filter is right, and for `failed`/`canceled` it is —
those moved no money. `pending` is the different case: it is *provisional* money, and the code
treats it as settled. This is a regression in kind rather than in code: under r12's rule a live
refund that was not exactly ours produced a loud refusal and nothing moved, so a human looked at
it; the top-up silently subtracts it and finishes. Card-only is pinned, and card refunds usually
land `succeeded`, which is why this is P2 rather than P1 — but it is not zero, and the failure
mode is silent and permanent.

**Fix direction:** treat `pending` as owed-but-not-yet-returned rather than as returned — either
exclude it from `alreadyRefunded` and let Stripe's own over-refund rejection stop a double (the
retry path already self-heals from that), or keep it in the sum and add a `charge.refund.updated`
webhook case that reopens the order when a counted refund fails.

---

### P2 — The partial-adoption write sets `stripe_refund_id` before the top-up is created, so a failed top-up tells the buyer "Buyer refunded" on an order where they got nothing — and `cancelUnshipped` sends no thread message, no bell and no email

**Where:** `src/lib/settleRefund.ts:294-300` (the adoption write, now reached on any
`alreadyRefunded > 0` including a foreign partial) against `:396-398` (the 502 message keys on
`refundId` being truthy) and `src/lib/cancelUnshipped.ts:60` (`if (!result.ok) return result`,
before every notification).

**What happens:** support gave the buyer a $25 goodwill refund in the Dashboard last week. The
window is missed, the buyer presses **Cancel for a full refund**. `settleRefund` lists, finds
$25, and because `live.find(metadata.order_id === order.id)` misses it falls back to `live[0]` —
so `refundId` becomes `re_goodwill` and is persisted to `orders.stripe_refund_id`. The top-up
`refunds.create` for $496 then fails: a Stripe 500, a timeout, a card-network refusal. The catch
at `:384` is the generic branch, `refundId` is truthy, and the buyer's toast reads **"Buyer
refunded, but the artist payout reversal failed — RETRY to complete it."** The buyer has had $25
of $521. No system message is posted to the thread, no bell is inserted and no cancellation email
is sent, because `cancelUnshippedOrder` returned at `:60` before all of that. The order stays
`paid`, the artist has heard nothing, and the row now carries a `stripe_refund_id` pointing at a
refund the platform did not create.

**Why it's real:** before `6f6db0f`, `refundId` could only become truthy inside the try block
after an *exact* adoption (in which case no create followed) or after a successful create — so
the "Buyer refunded" half of the 502 was always true. Moving the id write ahead of the create is
what made it reachable while the buyer holds nothing. I checked the row-write itself is not the
problem: `moneyHasMoved` being true on the retry is *correct* (money genuinely moved, just not
ours), and the retry does complete the top-up. The nightly reconcile does catch the stranded row
(`stripe_refunded_order_not_refunded`), so this is a wrong message and a silent party rather than
lost money — P2, not higher.

**Fix direction:** key the 502's wording on whether *this call* moved money — track the created
refund separately from the adopted id — and either defer the `stripe_refund_id` write until after
the top-up succeeds, or write it and say "partially refunded" in the failure text. The
notification skip is the same one-line shape as backlog #4 and belongs with it.

---

### P2 — The surviving refusal is escapable on a first settle and not after one: `alreadyRefunded > refundAmount` plus the recorded-reason guard is a state where no reason works

**Where:** `src/lib/settleRefund.ts:288-292` (the refusal and its "choose the reason that
matches" advice) against `:191-197` (the reason-mismatch guard, which fires whenever
`moneyHasMoved`) and `:102` (`moneyHasMoved = !!order.stripe_refund_id`).

**What happens:** the prompt asks whether switching to a fault reason genuinely clears the
refusal in every case. On a first settle it does, and I verified the arithmetic: a fault reason's
`refundAmount` is `amount + shipping + fee + tax`, which is the whole charge by construction
(`checkout/route.ts:113-140` builds the charge out of exactly those lines, `orderRecord.ts:154-162`
records them), and `alreadyRefunded` can never exceed the charge — so `alreadyRefunded >
refundAmount` is arithmetically impossible under any fault reason. The advice works.

It stops working once the row carries a refund id. Sequence: an admin settles `change_of_mind`;
the $490 refund is created and persisted; the close fails and returns `RETRY_CLOSE`. Support then
issues a further $31 in the Dashboard while the order is still open. Now `alreadyRefunded` is
$521 and the retry under `change_of_mind` throws `StripeStateMismatch`, whose message tells the
admin to pick a fault reason — but a fault reason is refused two hundred lines earlier by the
mismatch guard at `:191`, because `moneyHasMoved` is true and `refund_reason` is
`change_of_mind`. Both doors are shut. There is no force-close, no mark-refunded and no override
anywhere in `src/app/admin/orders/page.tsx`, and `charge.refunded` cannot rescue it either — the
full charge *is* refunded here, so it would fire, but only if a refund event arrives after the
order is looked up; the events for both refunds have already been delivered and acked.

**Why it's real:** I tried to find a third door. The only writers of `status = 'refunded'` are
`settleRefund`'s close, `charge.refunded` and `charge.dispute.closed`'s lost branch, and the
first two are the ones just shown to be blocked. The reachability is the thin part — it needs a
Dashboard refund landing between a half-finished settle and its retry — which is why this is P2
and not a repeat of r12's P1. But it is the honest answer to "are there states where no reason
works", and it is a state a support-plus-admin pair can create in an afternoon.

**Fix direction:** let the mismatch guard yield to the refusal it is standing in front of — when
`alreadyRefunded` already exceeds the recorded reason's figure, a switch to a fault reason is the
*correction*, not a re-settle under a different split. Alternatively give the admin page the
force-close r12 asked for; either one gives this state a door.

---

### P3 — When `charge.transfer` is absent the reversal is skipped in silence, the order still closes as `refunded`, and nothing in the product or the reconcile notices the artist kept the payout

**Where:** `src/lib/settleRefund.ts:344-383` — `if (charge?.transfer)` has no `else`, and
`payoutReversedCents` stays 0 while execution falls straight through to the close at `:412`.
Compare `src/app/api/webhooks/stripe/route.ts:531-556`, whose "artist keeps N¢" alarm is inside
the same `charge.transfer` condition, and `src/utils/reconcileStripe.ts`, which diffs refunds and
disputes and never looks at reversals at all.

**What happens:** the payment intent's `latest_charge` comes back without `transfer` — an
expansion that returned a partial object, or a payment recorded against an order whose transfer
was created out of band. `settleRefund` refunds the buyer, skips the reversal entirely, reports
`payoutReversedCents: 0`, closes the order as `refunded`, relists the piece and returns `ok:
true`. The admin sees "Refund settled." (the figure is discarded — r12's P2), the artist keeps
85% + shipping on an unwound sale, and the platform funds it. There is no Sentry line, no admin
notification and no nightly mismatch: the webhook's alarm is gated on the same missing field, and
the reconcile only compares refund and dispute state.

**Why it's real:** the whole point of r11's rewrite was to *measure* the reversal rather than
infer it, and this is the one path where the measurement is skipped rather than measured as zero.
I could not construct a realistic way for a destination charge to arrive without `transfer`,
which is why this is P3 — the finding is that when it does happen the failure is completely
silent, in the one function whose comments say the platform must never quietly eat the payout.

**Fix direction:** make the missing-transfer case loud — `Sentry.captureMessage(..., 'error')`
plus the same admin notification `charge.refunded` sends — rather than a fall-through, and have
`handleSettleRefund` fail the toast when `payout_reversed_cents < artist_payout_cents` on an
order that has a payout.

---

## Appendix: minor

- In the refund-approved state the buyer sees the settling message twice: the new L7 sentence at
  `orders/page.tsx:344` and the older one at `:471`, which is the only one of the two that
  mentions the return condition.
- `settleRefund` returns `refundedCents: refundAmount` — the buyer's cumulative total, not what
  this call moved — so `cancelUnshipped`'s thread message and email say "refunded in full
  ($521)" on a settle that transferred $496 and inherited $25 from a refund issued elsewhere.
- Topping up absorbs a goodwill refund rather than adding to it: a $25 credit support promised
  for a late shipment simply reduces the settle's top-up, and the buyer ends on the same figure
  as if it had never been given. That is the documented intent of the rewrite, but nobody outside
  the Sentry breadcrumb is told the credit evaporated.
- After a top-up, `orders.stripe_refund_id` names only the last refund created; the earlier ones
  on the same payment intent are unreferenced by any row. Extends r12's note that the column no
  longer means what its name says.
- `refunds.list` is called with `limit: 100` and no pagination. Unreachable today; worth knowing
  it silently truncates rather than erroring.
- **UNVERIFIED, auth-adjacent:** dropping newest-wins means two profile fetches inside one epoch
  both apply, so if `onAuthStateChange` ever delivers a `SIGNED_IN` for a *different* user
  without an intervening sign-out (a direct `signInWithPassword` over a live session), the slower
  of the two fetches wins and the header can show the previous account's profile against the new
  session. Every flow I could find emits `SIGNED_OUT` first, which invalidates. Settling it means
  driving a same-tab account switch against a real Supabase client.

## Not findings

- **The top-up arithmetic, all six paths the prompt names.** Nothing at Stripe → `owed =
  refundAmount`, one create. Our own full refund on a resume → `already = refundAmount`, `owed =
  0`, no create (pinned at `settleRefund.test.ts:422`). One foreign partial → tops up the
  difference. Two foreign partials → the `reduce` sums both and tops up the remainder; the buyer
  still lands on `refundAmount` exactly. A refund created between the list and the create → the
  create exceeds the charge, Stripe rejects it, the generic catch reports "safe to retry" with
  `refundId` null, and the retry recomputes the correct smaller top-up. I could not find a path
  that refunds twice or leaves the buyer on the wrong total, `pending` aside (P2 above).
- **`refund_<order>_<owed>` as an idempotency key.** Two concurrent settles that both list before
  either creates compute the same `owed` and collapse onto one refund. Two that list on either
  side of a create compute `owed = refundAmount` and `owed = 0`, so only one creates. The only
  way to reach genuinely different `owed` values is two settles under different *reasons*, and
  then the second create is for more than the charge can bear, so Stripe rejects it rather than
  paying it — the buyer ends on whichever reason won, the order closes under that reason, and the
  loser gets a 409 or a 400. No path pays out twice.
- **One payment intent, one order.** I checked this before trusting the `refunds.list` filter:
  `payments/checkout` builds a session from a single `listingId` with `mode: 'payment'`, and
  `buildOrderRecord` records one order per session. So `alreadyRefunded` can never contain a
  sibling order's refund.
- **The reversal, read cold.** `already = transfer.amount_reversed`, `owed = payout - already`,
  reverse only the shortfall under `reversal_<order>_<owed>`. Two runs on the same reading
  collapse; a run overtaken by an external reversal asks for more than remains, Stripe rejects
  it, and the retry recomputes. Total reversed cannot exceed `artist_payout_cents` because every
  run recomputes from the transfer. `payoutReversedCents < order.artist_payout_cents` at `:344`
  is always true on entry (the variable is initialised to 0 and never written before the block),
  so the guard reduces to `artist_payout_cents > 0` — which is the intent. The missing-transfer
  fall-through is P3 above; everything else holds.
- **The buyer's card, the full matrix.** Sixteen combinations of `refund_approved_at` ×
  `proposed_ship_by` × `agreed_ship_by` × `win.missed`, plus the `is_pickup` and non-`paid` exits.
  Every rendered button is one the route accepts: **Accept** only renders when `proposed_ship_by
  && !agreed_ship_by && !refund_approved_at`, which is exactly `accept-ship-by`'s four conditions;
  **Cancel** renders on `win.missed` or an unanswered proposal, both of which `cancel-unshipped`
  grants. No button 409s. The one *missing* button is the P2 above. I also checked the return gate
  cannot bite the refund-approved cancel: `authorizeReturn:68` forces `required = requested &&
  !pieceIsWithArtist(order)`, and an unshipped non-pickup order is always `pieceIsWithArtist`, so
  `order_returns.required` is false and `returnBlocksSettlement` returns null.
- **The `moneyHasMoved` gate-skip after a foreign adoption.** I chased this hard as a possible
  P0 — a stray `stripe_refund_id` makes a later call skip `requireUnshipped`, the artist-approval
  gate and the return gate. It is contained: both gates that matter are evaluated *before* the
  Stripe block on the first call, so a run that adopted a foreign refund had already passed them,
  and the outer `cancel-unshipped` route re-checks `status !== 'paid' || shipped_at` on its own
  before calling in.
- **`charge.refunded` after a fault top-up.** It fires (the top-up completes the charge) and can
  in principle beat `settleRefund`'s step 3, in which case the un-reversed-payout alarm is raised
  spuriously and the close CAS loses. Real, but unchanged by `6f6db0f` and inherent to every
  fault refund since the webhook was written — the ordering is heavily in `settleRefund`'s favour
  (its remaining work is two Stripe calls; the webhook is a network round trip away).
- **The fulfilment-window cron.** Read twice. `.eq('is_pickup', false)`,
  `.is('refund_approved_at', null)`, the proposal check, the `artistSpokeSince` leniency and the
  25-cancel cap all still hold. Nothing in `6f6db0f` reaches it, and its `refund_approved_at`
  filter is what keeps the P1 above confined to the buyer's button.
- **`db-smoke.sql` §6 and §14.** `6f6db0f` ships no migration and neither section needed to move.
  I re-confirmed `NEW.refund_approved_at := OLD.refund_approved_at` is in the freeze list of
  every `guard_orders_update` revision from 00038 through 00066, so the column all four
  card-level gates key on cannot be written by an artist or a buyer. §14 still pins
  `order_returns` as client-unwritable and anon-unreadable.
- **`calculateRefundSplit`.** Untouched, and both branches still match the documents: fault
  returns the whole charge, change-of-mind retains the fee and `round(tax × fee / taxedBase)` of
  the tax. The fault branch summing its parts rather than a stored total is what makes the
  "a fault reason returns the whole charge" escape in the surviving refusal arithmetically safe.
- **`CONVENTIONS.md` compliance.** The row-assertion rule is scoped to client-side supabase-js
  writes; every unchecked `.update()` in `settleRefund` is a service-role server write, and the
  one write that must not fail silently (the close) does assert with `.select('id')
  .maybeSingle()`. `orders/page.tsx`'s new branch adds no writes. No violation this commit.
- **`createSessionEpoch` and the `AuthContext` wiring.** The inversion is correct: only
  `invalidate()` moves the epoch, a non-`PGRST116` error now keeps the current user rather than
  clearing it, and the sign-out branch invalidates before `setUser(null)` so no in-flight fetch
  can put the person back in the header. The one residual is the UNVERIFIED appendix line.
