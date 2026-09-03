# Money & order lifecycle — review r7 (legal-alignment arc) — 2026-09-03

**Files read (in full unless noted):**
`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md` (money/fulfilment rulings), `docs/reviews/04-money-r5.md`,
`04-money-r6.md`, `01-auth-access-r3.md`/`-r4.md` (headings + findings, to avoid re-reporting);
`src/lib/settleRefund.ts`, `src/lib/cancelUnshipped.ts`, `src/lib/orderReturns.ts`,
`src/lib/assessProtection.ts`, `src/lib/orderThread.ts`;
`src/utils/refundSplit.ts`, `src/utils/orderReturns.ts`, `src/utils/fulfillment.ts`,
`src/utils/fulfillmentWindow.ts`, `src/utils/evaluateProtection.ts`, `src/utils/artistRepliedInTime.ts`,
`src/utils/orderRecord.ts` (the order record only);
`src/app/api/admin/orders/[id]/refund/route.ts`, `.../signature-confirmed/route.ts`, `.../return/route.ts`;
`src/app/api/orders/[id]/approve-refund/route.ts`, `.../cancel-unshipped/route.ts`,
`.../propose-ship-by/route.ts`, `.../accept-ship-by/route.ts`, `.../return-shipped/route.ts`,
`.../concede-dispute/route.ts`, `.../confirm-pickup/route.ts`;
`src/app/api/cron/fulfillment-windows/route.ts` (twice);
`src/app/api/webhooks/stripe/route.ts` lines 482–1000 (charge.refunded, dispute created/updated,
dispute closed) plus both extraction diffs; `src/app/api/payments/checkout/route.ts` (line items);
`src/services/orders.ts`, `src/services/email.ts` (`sendOrderCancelledEmail`), `src/app/api/messages/route.ts`;
`src/app/(user)/orders/page.tsx`, `src/components/studio/SalesSection.tsx`,
`src/app/admin/orders/page.tsx`, `src/components/studio/ProtectionBadge.tsx`,
`src/components/chat/ChatThread.tsx`, `src/components/chat/MessageInput.tsx`;
`src/utils/fulfillmentWindow.test.ts`; migrations `00041`, `00060`, `00061`, `00062`, `00064`, `00066`
(guard body mechanically diffed against `00062`), `scripts/db-smoke.sql` §6 and §14 in full;
`git show 0776480`, `git show 7e9a6c9`, `git show 9bfe0ff`, `git show f865b9d`.

**Partly covered, and why:** `scripts/db-smoke.sql` §10–13 and §15–16 belong to 00058/00059/00063/00065/
00067/00068 (acceptance, listing standards, signup, DMCA) and are outside the money slice — I read
their headers and grepped them for the fulfilment/return column freezes only. Migrations `00063`,
`00065`, `00067`, `00068` read only where they touch `orders`, `order_returns` or `guard_orders_update`.
I did not run vitest or db-smoke. I did execute `businessDaysBetween`, `addBusinessDays` and
`fulfillmentWindow`'s deadline standalone (3,000 inverse cases; a binary search for both flip
instants); P2‑4 rests on that output, not on reading.

**Verdict:** Both extractions are clean and I could not break them — `assessProtection` is byte-for-byte
the block removed in `7e9a6c9`, and `settleRefund` still carries every guard, both idempotency keys,
the close CAS, the relist CAS and all five Sentry paths from `0776480`, plus three added guards. The
damage in this slice is all in the *predicates* the arc reasons with: possession is now a two-sided
pickup confirmation the refunding buyer is motivated to withhold, "the artist spoke" is a
`message_type` filter that two readers disagree about, and the ship-by boundary fix moved one of the
two clocks that share it.

---

### P0 — A pickup buyer who simply never taps "Confirm pickup handoff" gets a change-of-mind refund with no return, keeps the artwork, and the piece is relisted

**Where:** `src/utils/fulfillment.ts:28-35` (`buyerTookPossession`);
`src/app/api/orders/[id]/approve-refund/route.ts:56`, `:91`;
`src/lib/orderReturns.ts:57`; `src/components/studio/SalesSection.tsx:454-458`;
`src/app/api/orders/[id]/confirm-pickup/route.ts:51-53`; `src/utils/orderReturns.ts:93-94`;
`src/lib/settleRefund.ts:210`, `:231`.

**What happens:** `f865b9d` fixed r6's P0 by replacing `!!shipped_at` with `buyerTookPossession()`,
which for a pickup order means `status === 'delivered'` **or both** `pickup_confirmed_by_buyer_at`
**and** `pickup_confirmed_by_artist_at`. Those confirmations are voluntary buttons
(`orders/page.tsx:271-285`, `SalesSection.tsx:387-400`) with no nudge, no email and no stated
consequence, and a pickup order reaches `delivered` by no other route.

A Houston buyer collects a $2,400 canvas from the studio. The artist taps "Confirm pickup handoff";
the buyer does not — the card just shows the artist "You confirmed the handoff — waiting on the
buyer." The order stays `paid` with `shipped_at` NULL. A week later the buyer asks for a refund in
Messages. The artist opens Approve refund and the modal tells them, over the top of their own
confirmation, *"The buyer never received this piece, so there is nothing to send back — no return
address needed"* (`:454-458`). No address is collected, `authorizeReturn` is skipped entirely
(`approve-refund:91`), and no `order_returns` row is written. `confirm-pickup` now refuses on
`refund_approved_at` (`:51-53`), so neither party can repair the record afterwards. An admin opens
`/admin/orders`, sees an artist-approved refund and — because the return block renders nothing when
there is no record (`admin/orders/page.tsx:299`) — settles `change_of_mind`.
`returnBlocksSettlement(null)` returns `null`, the gate opens, the buyer is refunded, the payout is
reversed, and because `wasShipped` is computed from `status` alone (`settleRefund:210`) the order is
`paid`, so `:231` **relists the painting as `available`** while it hangs on the buyer's wall.

**Why it's real:** I looked for the guard in each layer and it is in none of them. The predicate is
literally two-sided (`fulfillment.ts:34`), so one confirmation is worth zero; `authorizeReturn`
computes `required` from the same call (`lib/orderReturns.ts:57`), so even invoking it would produce
`required: false`; the settle gate treats a missing record as "nothing owed" (`utils/orderReturns.ts:94`);
and `settleRefund`'s relist decision was never converted to `buyerTookPossession` at all — it still
keys on status, which for an unconfirmed collected pickup is the same defect r6 named. The incentive
runs the wrong way: withholding the confirmation is the buyer's own interest twice over (it also
denies the artist protection, `evaluateProtection:146-151`), and the artist is shown a sentence that
contradicts the confirmation the same page tells them they made.

**Fix direction:** For possession, a *single* confirmation should count — the artist's own
`pickup_confirmed_by_artist_at` is first-party evidence the piece left the studio, and treating it as
"the buyer never received this" is the bug. Keep the two-sided rule for seller protection (where it
is a guard against the artist manufacturing evidence) and use a one-sided rule for "is there
something to send back", and pass `buyerTookPossession` into `settleRefund`'s relist decision instead
of `status`.

---

### P1 — Custom Canvas's own system notes are posted in the BUYER's name, and seller-protection requirement 6 counts them as unanswered buyer messages

**Where:** `src/lib/assessProtection.ts:51-56` (no `message_type` filter) versus
`src/app/api/cron/fulfillment-windows/route.ts:210-217` (`.eq('message_type', 'text')`);
`src/lib/orderThread.ts:68-73`; the buyer-attributed call sites are
`accept-ship-by/route.ts:74-81`, `cron/fulfillment-windows/route.ts:164-176`,
`lib/orderReturns.ts:104-122`, `return-shipped/route.ts:72-79`, `lib/cancelUnshipped.ts:69-81`;
`src/utils/artistRepliedInTime.ts:44-58`; `src/components/studio/ProtectionBadge.tsx:63`.

**What happens:** `postOrderSystemMessage` writes a real `messages` row with
`message_type: 'system'` and `sender_id` set to one of the two parties (`orderThread.ts:68-73`).
Requirement 6 reads that same thread with **no type filter** and treats any row whose `sender_id` is
the buyer as a buyer message awaiting a reply.

Single-order path, no pickup and no missed window involved: an artist proposes a new ship-by date on
day 2, inside the original window (`propose-ship-by` has no missed-window precondition). That note is
attributed to the artist — harmless. The buyer accepts, and `accept-ship-by:77` posts *"The buyer has
accepted the new ship-by date of October 1."* **in the buyer's name**. The artist ships on day 4,
inside the original 5 business days, with USPS tracking, marks delivered, and the listing had four
photos and condition notes. Nobody writes another message — there is nothing to answer; it renders as
a system note (`MessageBubble.tsx:39`). Sixty days later the buyer files a non-receipt chargeback.
`assessProtection` runs, `artistRepliedInTime` finds `awaitingSince` set to the acceptance note and no
artist message after it, `businessDaysBetween(…, now) > 3`, and requirement 6 fails — so a fully
compliant order is `ineligible`, the dispute is lost, and `webhooks/stripe:946` reverses the artist's
payout instead of Custom Canvas absorbing it. The cross-order version is worse: conversations are
keyed by the participant pair, so a return-authorisation or cron note on order A poisons requirement 6
for order B with the same repeat collector.

**Why it's real:** the artist can neither see it nor fix it. `ProtectionBadge.tsx:63` hard-codes
`artistRepliedWithinWindow: true`, so Studio says "Protected" throughout. And a late reply does not
heal it: `artistRepliedInTime:50` returns `false` the moment it sees an artist message more than three
business days after `awaitingSince`, so the verdict is permanent from the fourth business day onward.
The smoking gun is that the cron's own reader of this thread *does* filter (`:215`, comment: "Read the
same way requirement 6 reads it") — the two readers of the same messages disagree, and the one that
decides money is the unfiltered one. Every buyer-attributed system message is new in this arc: before
`0776480` the only caller was the webhook's pickup branch, which posted with
`sender_id: artistUserId`.

**Fix direction:** Exclude `message_type = 'system'` from the requirement-6 message read — a note the
platform wrote is not a question the artist failed to answer — and, symmetrically, decide whether a
system message attributed to the artist should be allowed to *clear* the clock either. One shared
"messages that count as a party speaking" query for `assessProtection` and `artistSpokeSince` would
stop the two from drifting again.

---

### P1 — The cron treats an artist who replied with a photo or a file as silent, and cancels and refunds their sale

**Where:** `src/app/api/cron/fulfillment-windows/route.ts:210-217` (`.eq('message_type', 'text')`),
reached from `:99`; `src/components/chat/ChatThread.tsx:64-72`;
`src/app/api/messages/route.ts:23`, `:57`; migration `00045_message_type_file.sql:8-9`.

**What happens:** `artistSpokeSince` counts only `message_type = 'text'`. The chat composer sends an
attachment as its own message with `message_type: 'image' | 'file'` and
`content: a.attachment_type === 'image' ? '' : a.fileName` (`ChatThread.tsx:64-72`) — there is no
caption field, so a photo is never accompanied by a text row.

An artist is four days late on a $1,500 commissioned canvas. The cron nudges on day 6 and stamps
`platform_nudged_at`. The artist answers the way an artist actually answers — a photograph of the
piece packed and taped, sent from the thread. They do not tap "Can't ship in time", so
`proposed_ship_by` stays NULL. Five business days later the cron reads the thread, sees no `text` row
from them, and calls `cancelUnshippedOrder(by: 'platform', reason: 'not_shipped')`: the buyer is
refunded the whole charge including the service fee, the artist's payout is reversed, the order closes
and the listing is relisted — for a piece the artist showed us in the box, with no human present.

**Why it's real:** the filter is not defensible as "system notes must not count as the artist
speaking", because it also excludes the two participant types the composer can actually produce. The
module states the opposite principle in its own words — every read failure in this function resolves
lenient (`:195`, `:205`, `:220`) "because the cost of being wrong is cancelling a live sale" — and
then applies the strictest possible definition of speaking. The three other participant types
permitted by `PARTICIPANT_MESSAGE_TYPES` (`messages/route.ts:23`) and by the 00045 CHECK are `image`,
`file` and `listing_card`; only `text` counts. The order is otherwise a normal one: it is `paid`,
`shipped_at` NULL, `is_pickup` false, so nothing else in the chain stops it.

**Fix direction:** Count any participant-authored message — `.in('message_type', ['text','image','file','listing_card'])`,
or equivalently everything except `'system'` — since the thing being tested is "is this artist
reachable", not "did they type". The stricter reading only ever fires in the direction the module says
it must not.

---

### P2 — The ship-by boundary fix moved the cancel clock six hours but not the protection clock, so an artist who ships in the last six hours of the promised day is on time *and* late

**Where:** `src/utils/fulfillmentWindow.ts:63-65` (the `+6h` added by `f865b9d`) versus
`src/utils/evaluateProtection.ts:97-115` (`businessDaysBetween`, unchanged) and `:156`
(requirement 1); the divergence is pinned as correct by `src/utils/fulfillmentWindow.test.ts:88-93`.

**What happens:** `f865b9d` set the missed-window deadline to `23:59:59.999Z` on the ship-by date
**plus six hours**, i.e. end of the Houston civil day. Requirement 1 was left alone: it fails when
`businessDaysBetween(created_at, shipped_at) > windowDays`, and that function normalises both ends to
UTC midnight, so it flips at `23:59:59.999Z` on the same date — six hours earlier. Before the fix the
two flipped at the same instant; now they disagree on every non-Friday ship-by.

Executed, using the test's own fixture (`created_at = 2026-08-03T12:00Z`, ship-by "August 10, 2026"):
at `2026-08-11T00:30Z` — 7:30pm Houston on 10 August — `fulfillmentWindow(...).missed` is `false`
(the test asserts exactly this, line 90), while `businessDaysBetween` returns **6 > 5** and
requirement 1 fails. So an artist whose card says "Ship by August 10" and whose buyer still has no
cancel button drops the parcel at 7:30pm on 10 August and silently loses seller protection for it. On
a later non-receipt chargeback their payout is reversed for the full disputed amount instead of the
platform absorbing it, and `ProtectionBadge` said "Protected" the whole time (requirement 6 aside, it
computes requirement 1 from the same UTC-day arithmetic). I include this only because the r6 P2 was
actioned and the action introduced the disagreement: the report and `f865b9d`'s message both say the
deadline is now end-of-day Houston, and it is — for one of the two consumers.

**Why it's real:** verified by executing both predicates and binary-searching each flip instant, not
by reading: the gap is exactly +6.00 hours for a Monday–Thursday ship-by and −42 hours for a Friday
one (Saturday and Sunday add no business days, so requirement 1 is accidentally lenient there). The
inverse property r5 and r6 checked still holds — 3,000 `businessDaysBetween(iso, addBusinessDays(iso, n))`
cases, zero failures — so this is not an inverse bug; it is two different definitions of "the end of
the promised day" living in two files.

**Fix direction:** Give requirement 1 the same deadline object the buyer's clock uses — compare
`shipped_at` against `fulfillmentWindow({...}).shipByIso`'s end-of-Houston-day rather than counting
UTC business days — or move both onto one Houston-civil-day helper, which is what r5's P3 and r6's P2
both asked for. A test at 23:30 CT on the promised day asserting *both* `missed === false` and
requirement 1 passing would have caught this.

---

## Appendix: minor

- `settleRefund.ts:129-135` reads the return gate once at the top and nothing re-asserts it before the
  close at `:211`; an admin who authorises a return through `admin/orders/[id]/return` while a settle
  is between step 1 and step 3 is bypassed. Narrow, admin-only, and the money had already left.
- `settleRefund.ts:273` returns `refundAmount` recomputed from *this* call's reason even when step 1
  was skipped because `stripe_refund_id` was already on the row. A retry under a different reason makes
  `cancelUnshipped`'s "refunded in full (X), including the service fee" state an amount that was never
  refunded. Same root as r5's P2 (`refund_reason` first-write-wins, money last-caller-wins).
- The admin refund route now reads `refund_approved_at` in a query separate from `settleRefund`'s own
  read (`refund/route.ts:42-46`); pre-extraction both came from one read. Only the recorded
  `refund_initiated_by` label can disagree, but the extraction did split that read.
- `propose-ship-by` and `accept-ship-by` still have no `is_pickup` guard (`:72`, `:38`). A pickup order
  is `paid` with `shipped_at` NULL forever, so both routes accept it and email the buyer about
  "cancel for a full refund" options that neither the Orders page nor `cancel-unshipped` will honour.
  No money follows — `cancel-unshipped:44` and `settleRefund:88` both refuse pickup now.
- Since `f865b9d`, `cancel-unshipped` refuses `is_pickup` **before** the buyer/artist branch, so the
  artist's own Artist Agreement §7 right to "cancel and tell the buyer promptly" has no surface at all
  on a local-pickup order. Deliberate per L12 (a no-show is a support process), but the artist is now
  strictly worse off than the buyer on a pickup order they want to call off.
- db-smoke §6 pins the freeze on `signature_confirmed_at` and now `agreed_ship_by`, but still not
  `signature_confirmed_by` (unchanged since r5's appendix).
- `orders_paid_unshipped_idx` (00062) is `WHERE status='paid' AND shipped_at IS NULL`; the cron's new
  `.eq('is_pickup', false)` is a filter on top of it rather than part of it. Fine at today's volume.

## Not findings

- **The `settleRefund` extraction.** Diffed line by line against `git show 0776480`. Every guard, both
  idempotency keys (`refund_<id>`, `reversal_<id>`), the persist-immediately-after-each-Stripe-mutation
  retry design, the close CAS (`.neq('status','refunded')` + asserted `.select('id').maybeSingle()`),
  the relist count matching `orders_one_live_per_listing`, the `.eq('status','sold')` relist CAS, the
  500-character `admin_reason` truncation and all five Sentry paths survive with identical semantics.
  Three guards were **added** (null payment intent, `requireUnshipped`, and now `is_pickup`); the
  `disputed` check moved above the approval check, which changes only which 409 a caller sees first;
  `refund_initiated_by` was added to the Stripe metadata. Nothing was dropped.
- **The `assessProtection` extraction.** Byte-for-byte identical to the block removed from the webhook
  in `7e9a6c9` — including the deleted-party short-circuits and the "read failures degrade to replied"
  leniency. Only `export` was added. Its second caller (`signature-confirmed`) reads fresh, which is
  what makes a late recording count.
- **Three callers, one refund.** No path double-refunds, double-reverses or double-relists. Two
  concurrent settles hit `refund_<order_id>` with identical bodies (same reason, same note, same
  amount) on the cron/cron and cron/buyer cases, so Stripe replays one refund; `reversal_<order_id>`
  always carries `artist_payout_cents`, so it always replays cleanly. The close CAS admits exactly one
  caller past step 3, and the loser returns before any notification, so no duplicate emails or thread
  posts. What the keys do **not** protect: (a) two callers with *different* reasons send different
  `amount`s under the same key, which Stripe rejects outright and `settleRefund` reports as "safe to
  retry" (r5's P2); (b) anything more than 24 hours apart, where the key has expired and the persisted
  `stripe_refund_id` plus Stripe's unrefunded-amount ceiling are the real guard.
- **The fault/change-of-mind arithmetic.** `refundAmount` on a fault reason is
  `amount + shipping + buyer_fee + amount_tax`, which is exactly the three checkout line items
  (`payments/checkout/route.ts:113-139`) plus `session.total_details.amount_tax` (`orderRecord.ts:161`)
  — the whole charge and never a cent more. The change-of-mind branch is strictly smaller by
  `buyer_fee + feeTax`, `Math.max(0, …)` covers the rounding edge, and the single `Math.round` can only
  cost the buyer half a cent.
- **Reaching the fault split on an order that does not deserve it.** The admin picks the reason (that
  is the job); `cancel-unshipped` hard-codes `not_shipped` for the buyer behind a missed window or an
  unaccepted proposal, and `artist_cancelled` for the artist on their own unshipped order; the cron
  hard-codes `not_shipped`. No caller lets a party choose.
- **Settling a change-of-mind refund the artist never approved.** Refused at `settleRefund:111-118`;
  `refund_approved_at` has one writer (`approve-refund`, artist-gated, CAS on `IS NULL`) and is frozen
  for non-privileged writers in `guard_orders_update` (00062/00066).
- **The return gate on every door.** The gate lives inside `settleRefund`, so the admin route, the
  buyer's cancel and the cron all pass through it; a retry re-reads it rather than skipping it, and the
  reason write at `:143` is *after* the gate, not before. The buyer-cancel and cron doors additionally
  cannot reach a required return at all, because a return is only required once the buyer has
  possession and `requireUnshipped` refuses both shipped and pickup orders.
- **The signature re-assessment racing the dispute-created CAS.** Three disjoint predicates: the
  signature route CASes on `protection_status = 'ineligible'` and only when `status = 'disputed'`; the
  created handler CASes on `.neq('status','disputed')`; the closed handler's late assessment CASes on
  `'pending'`. It cannot upgrade wrongly either — every other input is frozen at `disputed`
  (tracking/carrier by 00057, `delivered_at` and the evidence snapshot, `fulfillment_window_days` by
  00066), and requirement 6 cannot be healed late: `artistRepliedInTime:50` returns false on a reply
  more than three business days after the wait began. (The r6 appendix's ~1s window against the
  closed handler's own read is unchanged and still UNVERIFIED.)
- **`addBusinessDays` and `businessDaysBetween` are exact inverses.** 600 start instants × window
  lengths 1/3/5/10/20 — zero failures. The problem in P2‑4 is the deadline, not the pair.
- **The cron's select.** `status='paid'`, `shipped_at IS NULL`, `is_pickup = false`, `created_at ASC`,
  `limit 200`. `orders.is_pickup` is `BOOLEAN NOT NULL DEFAULT false` (00041:8), so `.eq(false)` loses
  no legacy rows. It cannot cancel an order that shipped a moment ago (`requireUnshipped` re-reads
  inside the money read), one with a proposed date (both stages short-circuit), or one where the
  artist replied *in text* (P1‑3 is about the other message types). Two concurrent runs are safe:
  stage 1 is CAS-stamped and stage 2 converges on the close CAS; a partial failure mid-loop leaves the
  cancelled orders cancelled and the rest for tomorrow.
- **00066's `guard_orders_update`.** Mechanically diffed against 00062's body: purely additive — one
  new freeze (`agreed_ship_by`) and two comments. Not one line of the transition matrix, the money
  freeze, the evidence freeze or the `shipped_at` stamp was lost, and db-smoke §6 now asserts
  `agreed_ship_by` is frozen for the artist alongside the 00060/00061/00062 columns.
- **`order_returns` exposure.** db-smoke §14 asserts, under `SET ROLE` rather than JWT claims alone,
  that there is no client INSERT/UPDATE/DELETE grant, no `anon` SELECT, that both parties can read
  their own record, that an outsider cannot (the address), and that the buyer cannot accept their own
  inspection.
- **`concede-dispute`** touches no money: artist ownership check, `disputed` status check, `.is(null)`
  CAS on a column no client can write.
