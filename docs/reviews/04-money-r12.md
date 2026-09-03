# Money & order lifecycle — review r12 (legal-alignment arc) — 2026-09-03

**Files read:**

- `git show 59c5c9b` in full (message + every hunk), then `git show 59c5c9b -- src scripts`
  again hunk by hunk.
- `src/lib/settleRefund.ts` at HEAD, three passes: once for the diff, once for the refusal
  paths, once tracing `payoutReversedCents` and `moneyHasMoved` end to end.
- `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`, `src/utils/orderReturns.ts`,
  `src/utils/refundSplit.ts`, `src/utils/fulfillment.ts`, `src/utils/fulfillmentWindow.ts`,
  `src/utils/reconcileStripe.ts` — all in full.
- Every route under `src/app/api/orders/[id]/`: `accept-ship-by`, `approve-refund`,
  `cancel-unshipped`, `concede-dispute`, `confirm-pickup`, `mark-delivered`, `notify-shipped`,
  `propose-ship-by`, `return-shipped`. Every route under `src/app/api/admin/orders/[id]/`:
  `refund`, `return`, `signature-confirmed`.
- `src/app/api/cron/fulfillment-windows/route.ts` twice; `src/app/api/cron/stripe-reconcile/route.ts`.
- `src/app/api/webhooks/stripe/route.ts` — the oversell auto-refund block, `charge.refunded` in
  full, `charge.dispute.created/updated` head, and `charge.dispute.closed`'s lost branch in full.
- Both order cards in full: `src/app/(user)/orders/page.tsx` and
  `src/components/studio/SalesSection.tsx` (card body + the approve-refund modal).
- `src/app/admin/orders/page.tsx` (the settle/return/signature handlers), `src/services/messages.ts`,
  `src/components/chat/MessageBubble.tsx`, `src/lib/acceptance.ts` (refusal shapes only),
  `src/utils/latestOnly.ts`.
- `scripts/db-smoke.sql` §6 (order transition matrix, both halves) and §14 (returns); the new
  DMCA-bucket block. `grep` for `refund_approved_at` across `supabase/migrations/`.
- `docs/CONVENTIONS.md`, `docs/POST-LAUNCH-BACKLOG.md` in full. `docs/reviews/04-money-r5.md`
  … `-r11.md` and `01-auth-access-r8.md`/`-r9.md` by finding heading, plus the full text of
  r11's P1 #3 and r11's appendix and "Not findings".

**Skipped, and why:** `src/utils/evaluateProtection.ts` and `src/lib/assessProtection.ts` were
opened only far enough to confirm `59c5c9b` does not touch them and that nothing on the refund
path reads them (the settle never re-assesses protection); their own boundary disagreement is
backlog #6 and I did not re-derive it. `README.md` and `DECISIONS.md` were not opened — the
prompt's "already settled" list plus `CONVENTIONS.md` covered every product decision I needed.
I did not run the app, `db-smoke`, the unit suite or the e2e suite (a Playwright run is holding
port 3000).

**Verdict:** The two money mechanics `59c5c9b` rewrote — exact refund adoption and
shortfall-only reversal — are correct; I tried hard to break both and could not. The damage is
again in the *edges* of the fix rather than its centre: the buyer's card lost the Terms of Sale
§3 cancel button along with the Accept button it was meant to lose, and the new
`StripeStateMismatch` is a refusal with no product-side way out whose own remediation sentence
points at the one action that leaves the artist's payout un-reversed. Six rounds, six times the
fix, not the build.

---

### P1 — The r11 fix removed the buyer's §3 "Cancel for a full refund" button along with the "Accept new date" button, so every artist-approved refund awaiting settlement leaves the buyer with no self-serve escape and no ship-by date at all

**Where:** `src/app/(user)/orders/page.tsx:320` (the added `&& !order.refund_approved_at`) against
`:356-372` (the `canCancel` button row, **inside** that block) and `:435-448` (all the buyer gets
instead). Compare `src/app/api/orders/[id]/cancel-unshipped/route.ts:69-80`, which deliberately
keeps the buyer's door open in exactly this state.

**What happens:** the artist approves a change-of-mind refund. `approve-refund` writes
`refund_approved_at` and admins get a bell; settling is a **manual** admin action, so every
approved refund sits in this state for as long as the queue takes. From that moment the buyer's
card renders no L7 block at all — no "Ships by 10 September", no "This should have shipped by
10 September and hasn't", no proposal, and no **Cancel for a full refund**. The single line they
get is "Refund approved — Custom Canvas is settling your payment." If the settle stalls (admin
away, or the 409 in the next finding), the buyer has money out, no piece, an artist whose own
card now reads "don't ship it", and nothing to press. Terms of Sale §3 and Artist Agreement §7
give them a unilateral cancel right "whether or not you approve" precisely for this, and
`cancel-unshipped:72` still grants it at the API — only the buyer can no longer reach it. The
fulfilment cron's own buyer notification (`fulfillment-windows:166`) says "You can cancel for a
full refund at any time from your order", and backlog #2 and #7 both rest their "nobody is
trapped" argument on that same button.

**Why it's real:** I looked for another door and there is none. `cancelForRefund` is called from
one place (`orders/page.tsx:371`), inside the gated block. The `['paid','shipped','delivered']`
block at `:435` swaps "Request a refund" for a sentence the moment `refund_approved_at` is set,
so there is no second control. The cron cannot rescue the order either — `fulfillment-windows:68`
filters `.is('refund_approved_at', null)`, so it never looks at it. And this is not a stale-tab
state: it is the ordinary state of every artist-approved refund between approval and settlement.
r11's own fix direction asked for "the same `!order.refund_approved_at` condition the artist's
now has, **so the only thing offered there is the cancel right §3 actually grants**" — the
condition was applied to the whole block, which took the cancel right with it.

**Fix direction:** gate only the "Accept `<date>`" button on `!refund_approved_at`, the way the
artist's card was fixed to gate only its buttons and keep its sentence. The buyer's block should
still render, with a refund-approved sentence of its own and the cancel button left standing.

---

### P1 — `StripeStateMismatch` is a permanent dead end for the order, and the remedy its own message recommends leaves the artist's payout un-reversed with nothing downstream to notice

**Where:** `src/lib/settleRefund.ts:271-283` (the refusal and its message), `:358-364` (the escape
from the retry catch), against `src/app/api/webhooks/stripe/route.ts:490` (`charge.refunded`
returns early on anything less than the full charge) and `src/app/admin/orders/page.tsx:117-151`
(the only settle door there is — there is no force-close, no mark-refunded, no override).

**What happens:** take the exact scenario the commit message is written around. Support issues a
$25 goodwill refund in the Stripe Dashboard on a $521 order. Later the artist approves a
change-of-mind refund and an admin clicks Settle. `refunds.list` returns one live refund; it is
not ours (`metadata.order_id` is absent on a Dashboard refund) and its amount is not
`refundAmount`, so `StripeStateMismatch` fires and the admin is told: *"Settle the difference in
the Stripe Dashboard, or pick the reason that matches what was already refunded."*

Both halves of that sentence are wrong here:

- **"Pick the reason that matches"** cannot work for any refund the platform did not create. The
  adoption test is `live.length === 1 && metadata.order_id === order.id && amount === refundAmount`
  — a Dashboard refund fails the metadata clause no matter which of the seven reasons is chosen,
  so every reason 409s.
- **"Settle the difference in the Dashboard"** is the damaging one. A change-of-mind refund is
  *by design* less than the charge (the service fee and its tax are retained), so after the admin
  tops the refund up to the change-of-mind figure, `charge.amount_refunded < charge.amount` and
  `charge.refunded` **breaks at line 490 before doing anything**. The order stays `paid`. The
  artist's transfer is never reversed — they keep 85% + shipping on a sale that has been unwound,
  and the platform funds it. The listing stays `sold`. The buyer's card still says "settling". And
  the transfer-reversal alarm at `webhooks/stripe:532-556`, which exists to catch precisely this,
  is inside the block that already returned. Retrying Settle now finds **two** live refunds and
  409s forever.

**Why it's real:** I tried to find the exit and there is none inside the product. The three
callers of `settleRefund` (admin refund route, `cancel-unshipped`, the cron) all return the 409
verbatim; `admin/orders/page.tsx:139` just toasts it. No route writes `status = 'refunded'` other
than `settleRefund`'s close and the two webhook handlers, and both webhook paths need either a
*full*-charge refund or a lost dispute. A fault-reason settle in the same situation is survivable
— the top-up reaches the full charge, `charge.refunded` runs, the order closes and the
un-reversed payout raises a Sentry error plus an admin notification — so it is specifically the
change-of-mind split that falls into the hole, which is the one reason an artist can trigger.
The nightly reconcile does notice (`reconcileStripe:94`, `stripe_refunded_order_not_refunded`)
but only as an un-acknowledgeable alert that repeats every night.

I am not calling this a P0 because the refusal itself moves no money and corrupts nothing: the
loss needs an admin to act on the advice. If you read "the product's own instruction loses the
artist's payout" as automatic enough, upgrade it.

**Fix direction:** the refusal is right; the sentence is not. Tell the admin the only safe manual
route (refund the *remainder of the full charge* in the Dashboard so `charge.refunded` closes the
order, or contact engineering), and drop the "pick the matching reason" suggestion for a refund
that fails the metadata test. Separately, an admin-only force-close that runs step 3 without step
1 would give this state a door.

---

### P2 — `payoutReversedCents` was made accurate and has no consumer: the admin UI discards it, and the confirm dialog has already promised the full reversal

**Where:** `src/lib/settleRefund.ts:235,318-356,450` (the measured value) →
`src/app/api/admin/orders/[id]/refund/route.ts:61` (`payout_reversed_cents` in the response) →
`src/app/admin/orders/page.tsx:134-145`, which reads `res.ok` and nothing else and toasts
"Refund settled." Compare `:122-128`, the pre-flight confirm: *"The artist's payout of
`formatPrice(o.artist_payout_cents)` is reversed."*

**What happens:** trace every value the figure can take. `artist_payout_cents === 0` → 0.
`charge.transfer` falsy → 0. Otherwise `owed > 0` gives `already + owed === artist_payout_cents`,
and `owed <= 0` gives `min(payout, already) === payout`. So it is binary: **0 or the whole
payout, never a partial**. The one value that carries information — 0, meaning "the buyer was
refunded and the artist kept the money" — is returned to a caller that drops it, after a dialog
that already told the admin the payout is reversed. The admin sees a green "Refund settled." in
both cases. r11's P1 was "the admin was told the whole payout had come back"; the number is now
honest, but nothing shows it to the admin, so the half of that finding about what the admin is
*told* is not closed.

**Why it's real:** I grepped `payout_reversed_cents` and `payoutReversedCents` across `src/` —
outside `settleRefund.ts` and its test there are exactly two hits, the route's response field and
the type. `cancelUnshipped.ts` does not read it either: its artist notification at `:94` asserts
"Your payout for it has been reversed" unconditionally, from a result object that carries only
`refundedCents`.

**Fix direction:** surface it — either put the figure in the success toast, or fail loudly when
`payoutReversedCents < artist_payout_cents` on a settle that expected a reversal. Two lines in
`handleSettleRefund`; no change to `settleRefund` itself.

---

### P2 — Both order cards go on inviting a local-pickup handoff after a refund is approved, while `confirm-pickup` refuses it — so a piece collected during the settle window is refunded with no return and relisted

**Where:** `src/app/(user)/orders/page.tsx:379-385` (gated on `is_pickup && status !== 'delivered'
&& status !== 'refunded'` — no `refund_approved_at`), `src/components/studio/SalesSection.tsx:408-413`
(gated on `is_pickup && status === 'paid' && !pickup_confirmed_by_buyer_at` — no
`refund_approved_at`), against `src/app/api/orders/[id]/confirm-pickup/route.ts:51-53`, which now
409s the handoff outright once `refund_approved_at` is set.

**What happens:** a pickup order nobody has confirmed. The buyer asks for a refund; the artist
approves and ticks "The buyer never collected this piece — it is still with me", so
`approve-refund` writes an `order_returns` row with `required: false`
(`approve-refund/route.ts:105-112`). Both cards then keep their pickup copy: the buyer reads
"Arrange pickup within 7 days of the artist's ready message. Can't make it? Tell them in
Messages", the artist reads "Buyer hasn't collected? Give them 7 days from your ready message,
then contact support before cancelling." Nothing on either card says the handoff is off. If the
buyer turns up and collects it — which is what their card tells them to do — neither party can
record it: both Confirm-pickup buttons are hidden on `refund_approved_at`
(`orders/page.tsx:271`, `SalesSection.tsx:418`) and the route refuses anyway. The settle then
reads `required: false`, moves the money, and `pieceIsWithArtist` is true (no `shipped_at`, no
confirmations) so the listing is relisted. Buyer has the painting and the money; the piece is
back on sale.

**Why it's real:** this is the r6/r7 P0 shape reached through a different door, and the fixes for
those closed the *derivation* (`buyerTookPossession`, `pickupPossessionUnknown`) rather than this.
`returnBlocksSettlement` returns null on `!ret.required` at `orderReturns.ts:108` with no
possession re-check — deliberately, because r10's P1 was the settle door re-deriving possession
and disagreeing with the artist. So the artist's honest answer at approval time is trusted for the
whole settle window, and nothing tells either party to keep it true. Not in the backlog (D13's
deferred item is *return status* on both cards, not pickup instructions), and not made worse by
`59c5c9b` — it is what the pass's "enumerate every state where the cards disagree" turned up
that the commit did not reach.

**Fix direction:** gate both pickup-arrangement sentences on `!refund_approved_at` and replace
them with one line saying the handoff is on hold while the refund settles. The route already
refuses; the cards should stop asking.

---

### P2 — `propose-ship-by` did not get the `refund_approved_at` guard its twin `accept-ship-by` got, so it emails the buyer instructions for two controls that no longer exist

**Where:** `src/app/api/orders/[id]/propose-ship-by/route.ts:61-94` — the select does not fetch
`refund_approved_at`, there is no refusal, and the CAS is `status = 'paid'` + `shipped_at IS NULL`
only. Compare the guard and the CAS clause added to `accept-ship-by/route.ts:41-56,74-78` in the
same commit.

**What happens:** the artist has Studio › Sales open in one tab and approves the refund from
another (or their phone). The stale tab still shows "Can't ship in time"; they submit a date. The
route succeeds, writes `proposed_ship_by`, and then posts into the shared thread, sends a bell and
sends an **email** all saying "You can accept the new date, or cancel for a full refund — both
options are on the order in your Orders page" (`:115`, `:123`, `:133`). On the buyer's Orders page
neither option is there: the whole L7 block is hidden by the P1 above, and `accept-ship-by` now
409s. The artist's own card then reads "Your proposed date of `<date>` is no longer on the table
for the buyer", which is true and which the buyer is never told.

**Why it's real:** `refund_approved_at` is not in the route's select list at `:63`, so no branch
can consult it, and the CAS at `:83-85` re-asserts only status and `shipped_at`. The commit
guarded the buyer's half of this exchange and left the artist's half open; the reachability is the
same stale tab the commit itself cites as justification for guarding `accept-ship-by`. The one
thing that keeps this at P2 rather than P1 is that no money moves and the artist's card corrects
itself on reload.

**Fix direction:** add `refund_approved_at` to the select, refuse with a 409 the way
`accept-ship-by` does, and add `.is('refund_approved_at', null)` to the CAS.

---

### P3 — `MessageBubble.tsx` ships the exact status-keyed 503 classification that the same commit removed from `services/messages.ts`

**Where:** `src/components/chat/MessageBubble.tsx:107-110` —
`res.status === 403 || res.status === 503` — against `src/services/messages.ts:80-82`, changed in
the same commit to `res.status === 403 || body.code === 'acceptance_unavailable'` with a comment
explaining why the status test was wrong.

**What happens:** a buyer presses "Accept quote" on an in-thread quote card during an edge or
platform blip. The response is a 503 with an HTML body, so `body.error` is undefined and
`byPolicy` is true. The catch at `:123-127` therefore skips `captureException`, and the toast
falls back to "Action failed. Try again." Nobody is paged, and the buyer's failed quote
acceptance — the step that commits them to a commission price — leaves no trace anywhere.

**Why it's real:** this is r9's P3 verbatim, and the acceptance gate's own 503 does carry
`code: 'acceptance_unavailable'` (`src/lib/acceptance.ts:210-214`), so the code-keyed form works
here identically to the way it works in `messages.ts` — there is no reason the two files differ
beyond an oversight in a single commit. Only a genuine platform 503 is misclassified, which is why
it is P3 and not higher.

**Fix direction:** key it on `body.code === 'acceptance_unavailable'` instead of `res.status === 503`,
matching the sibling file the same commit corrected.

---

## Appendix: minor

- `accept-ship-by/route.ts:84`: when the new `.is('refund_approved_at', null)` CAS clause is what
  lost, the buyer is told "This order has already shipped." — the one message that is certainly
  wrong in that case.
- A refused settle still writes `refund_reason` and `refund_initiated_by` unconditionally at
  `settleRefund.ts:213-216` *before* the Stripe block, so a `StripeStateMismatch` 409 leaves the
  row describing a settle that never happened. r11's appendix flagged the write; the new 409 path
  is a second way to reach it.
- A permanently stranded order (P1 #2) raises `stripe_refunded_order_not_refunded` from
  `stripe-reconcile` every night with no way to acknowledge or suppress it, which is how a real
  alert channel becomes background noise.
- `payoutReversedCents` can only ever be `0` or `order.artist_payout_cents` — the arithmetic at
  `:355` cannot produce a partial. Worth knowing before anyone builds a report on it.
- When the payout is already fully reversed out of band, `settleRefund` writes no
  `stripe_reversal_id` at all (`:340-353` only writes inside `owed > 0`), so the row keeps a NULL
  forever. Benign today — `disputeOutcome.ts:167` also consults `transfer.amount_reversed`, and
  `reconcileStripe` only prints the id — but it is a column that no longer means what its name says.
- `settleRefund.ts:314`'s `stripe_refund_id` write is unchecked, so a failure there closes the
  order as `refunded` with a NULL refund id. `reconcileStripe` will not flag it (Stripe and the
  order agree), and only the dispute handlers' `stripe_refund_id ||  status === 'refunded'` test
  saves the downstream. Same class as r9/r10's appendix note; `:285` (the adoption write) is
  self-healing, this one is not.
- The DMCA `restore` guard reads `dmca_removed_at` and `pre_dmca_status` off the **listing**, not
  the notice, so Restore on a second notice against a piece a *first* notice took down still
  republishes it and restores the first notice's quarantined images. Pre-existing and adjacent to
  r8-auth's P1 rather than caused by the new guard, which handles the `listing === null` case
  correctly (the early return fires, so the non-null dereference at `:104` is safe).
- Adoption compares amount and metadata but not the refund's own `refund_reason` metadata, and all
  six fault reasons produce the identical full-charge amount — so a resume under `not_shipped` will
  adopt a refund created under `damaged` and rewrite the row's reason. Harmless: the split is
  identical and the buyer-facing label is the only difference.

## Not findings

- **The exact-match adoption rule.** Each clause earns its place: `amount` is what stops the
  goodwill partial; `metadata.order_id` is what stops a stranger's refund; `live.length === 1` is
  what stops "one of ours plus one of theirs" summing to the right figure by accident; and
  filtering `failed`/`canceled` is right because those moved no money (Stripe's other live states,
  `pending` and `requires_action`, correctly count as in the way). `refunds.create` at `:294-312`
  always sets `metadata.order_id`, so the platform's own refund is always adoptable — I checked
  that the resume path is not dead. The only legitimate refund it refuses is one the platform did
  not create, and refusing that is the intent.
- **`reversal_<order>_<owed>` and the divergent-shortfall question.** I walked it. Two concurrent
  runs reading the same `amount_reversed` compute the same `owed` and collapse on the key. A run
  whose read is overtaken by an external partial reversal asks for more than remains, Stripe
  rejects it, and the retry recomputes the correct shortfall — self-healing, not a double
  claw-back. Two runs computing genuinely different shortfalls are two runs that each owe a
  different amount, and reversing both is correct. Total reversed cannot exceed
  `artist_payout_cents` because every run recomputes `owed` from the transfer.
- **`StripeStateMismatch` on the reversal step.** It cannot happen: the class is thrown only in
  step 1, before any money moves. A settle that has refunded the buyer and then fails on the
  reversal takes the generic catch and gets the correct "RETRY to complete it" 502, and the retry
  resumes from `amount_reversed`.
- **Dropping `!reversalId` from the reversal guard.** `payoutReversedCents` is always 0 at
  `:318`, so the condition reduces to `artist_payout_cents > 0` and the block runs on every call —
  which is the point, since it now measures rather than infers. A resume finds `owed === 0` and is
  a no-op.
- **`moneyHasMoved` and the skipped gates.** Unchanged this commit and still correct: adoption
  writes `stripe_refund_id` inside the try, after every gate, so the gate-skip only ever applies to
  a run whose predecessor genuinely moved money. The `refund_reason` mismatch guard at `:191` still
  catches the cross-door re-settle.
- **`charge.refunded` and the dispute-closed handler.** Both read `transfer.amount_reversed`
  directly rather than a row id, so neither inherited the r11 P1's blind spot, and
  `transferAlreadyReversed` at `webhooks/stripe:945` compares against `transfer.amount` which
  equals `artist_payout_cents` by construction (`checkout/route.ts:166-186`,
  `orderRecord.ts:137-159`).
- **The fulfilment-window cron.** Read twice. `.is('refund_approved_at', null)`, `.eq('is_pickup',
  false)`, the proposal check, the `artistSpokeSince` leniency and the 25-cancel cap all still hold,
  and nothing in `59c5c9b` reaches it.
- **`db-smoke.sql` §6 and §14.** `59c5c9b` ships no migration and neither section needed to move.
  §6 still pins the frozen-column set, and I confirmed `refund_approved_at` is in
  `guard_orders_update`'s freeze list across 00038–00066 — so the column all four of this commit's
  new gates key on cannot be written by an artist or a buyer. §14 still pins `order_returns` as
  client-unwritable and anon-unreadable. The new DMCA-bucket block is a real assertion with real
  teeth (existence, `public = false`, and zero policies naming the bucket).
- **`calculateRefundSplit`.** Unchanged, and both branches still match the documents: fault returns
  the whole charge, change-of-mind retains the fee and `Math.round(tax × fee / taxedBase)` of the
  tax.
- **The `CONVENTIONS.md` row-assertion rule.** It is scoped to *client-side* writes; the unchecked
  `.update()`s in `settleRefund` are service-role server writes, so they are not violations — which
  is why they are in the appendix and not a finding.
- **`createLatestOnly` and the `AuthContext` wiring.** `supersede()` increments rather than
  resetting, so no later `begin()` can reissue a retired ticket, and the sign-out branch supersedes
  before clearing. The four tests cover exactly the four states. Correct as written.
- **The DMCA restore guard's null handling and the acceptance-test mock.** Both fine: the early
  return covers `listing === null` before the non-null dereferences, and the mock now answers per
  table so the "buyer" fixture no longer owes the Artist Agreement.
