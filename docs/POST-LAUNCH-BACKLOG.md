# Post-launch backlog

*Opened 2026-09-03, at the end of the legal-alignment arc.*

Everything here was found by the arc's own adversarial review passes and is
**real**. None of it is a P0 or a P1 — those were all fixed and each is pinned
by a `db-smoke` assertion or a unit test that was verified to have teeth. What
is left is the P2/P3 tail, and it is deliberately not being cleared before
go-live.

The reason is on the record: **every P0 this arc produced was produced by a
fix.** Five of them. The original build did not contain them; remediation did.
Against a platform with no live orders on it, each additional change to money
or DMCA code is a worse expected outcome than the finding it closes. These are
almost all reachable only at volumes and edge cases that do not exist yet, and
the ones that do bite will announce themselves in Sentry with a real order id
attached — which is a far better brief than any of the entries below.

**Rule for picking work off this list:** re-confirm the finding against `HEAD`
first. Several entries were written across six review rounds and neighbouring
code has moved since. The review file named on each entry has the full
walkthrough.

---

## Money and fulfilment

**1. `requireUnshipped` and the relist decision are read without a lock, and
the close CAS does not re-assert them.**
`src/lib/settleRefund.ts` · `docs/reviews/04-money-r5.md`
The status is read at the top, the money moves, and the close is a
compare-and-swap on `status <> 'refunded'` only — so an artist who ships
between the read and the close gets a refunded order that also shipped. The
window is milliseconds and both doors are human-paced. Fix by folding
`shipped_at`/`status` into the close CAS.

**2. A stale `proposed_ship_by` disables the automated cancel path forever.**
`src/app/api/cron/fulfillment-windows/route.ts` · `04-money-r5.md`
Any proposal, however old and however ignored, takes the order off the cron's
list permanently. The buyer's manual cancel still works, so nobody is trapped —
they just have to press the button themselves.

**3. The "ask" that starts the automated-cancellation clock is an unchecked
in-app bell.** `src/lib/cancelUnshipped.ts` · `04-money-r5.md`
The stamp that starts the clock commits first and the notification is
best-effort after it, so a failed send leaves a clock running against an artist
who was never told. Wants the send checked before the stamp, or an email
alongside the bell.

**4. When the platform cancels an artist's sale and reverses their payout, the
artist is told only by an in-app bell.** `src/lib/cancelUnshipped.ts` ·
`04-money-r6.md`
Money left their balance and the only notice is a bell they may never open.
This one is small and worth doing early — it is a one-template email.

**5. The settle gate is fail-open when its own record fails to be created, and
nothing shows that it is missing.** `src/lib/orderReturns.ts` ·
`04-money-r6.md`
`authorizeReturn` failing to write leaves an approved refund with no
`order_returns` row, and `returnBlocksSettlement` reads "no record" as "nothing
owed" unless the reason's default says otherwise. The default now covers the
common reasons (that was r9's P1), so this is narrower than when it was
written — re-confirm before working it.

**6. The `+6h` ship-by boundary moved the cancel clock but not the protection
clock.** `src/utils/fulfillmentWindow.ts` vs `src/utils/evaluateProtection.ts`
· `04-money-r7.md`
An artist who ships in the last six hours of the promised day is on time by one
measure and late by the other, so they can lose seller protection on a shipment
the product told them was punctual. Pick one boundary and make both read it.

**7. The cron never cancels an order whose artist deleted their account, and
its nudge tells the buyer we asked an artist who no longer exists.**
`src/app/api/cron/fulfillment-windows/route.ts` ·
`supabase/migrations/00049_orders_survive_account_delete.sql` ·
`04-money-r10.md`
The join that finds the artist to nudge returns nothing, so the order falls out
of the sweep entirely and sits `paid` forever. Buyer's manual cancel still
works. Wants a branch that cancels straight away when the artist is gone.

**8. A failed signature re-assessment write is reported as success, and nothing
in the product can try again.**
`src/app/api/admin/orders/[id]/signature-confirmed/route.ts` ·
`04-money-r10.md`
The admin is told "Signature confirmation recorded" whether or not the row
took it, and the control disappears afterwards either way.

## Returns admin

**9. A return that comes back without the buyer tapping "I've shipped it back"
cannot be recorded as received.** `src/app/admin/orders/page.tsx` ·
`src/app/api/admin/orders/[id]/return/route.ts` · `04-money-r9.md`
The only unblock is a waiver reading "unnecessary", which is false — the piece
did come back. This is the most likely of all of these to be hit by a real
human, because buyers post things without pressing buttons.

**10. A rejected inspection leaves the admin row with no controls at all.**
`src/app/admin/orders/page.tsx` · `04-money-r10.md`
The gate correctly refuses to settle and the label tells the admin to inspect a
return they have already inspected, with nothing to click. The escape is a
support conversation, which is what the copy says to do anyway — but the screen
should say so.

## DMCA

**11. Quarantine is a one-way move with nothing stopping the artist re-uploading
to the exact path the claimant checked.**
`supabase/migrations/00038_launch_hardening.sql` (the `listing-images` INSERT
policy) · `01-auth-access-r6.md`
The listing itself is frozen by `guard_listings_update`, so the re-uploaded
file is not reachable through the product — but it is reachable at the URL in
the claimant's notice, which is the URL that matters for safe harbour.

**12. A notice at `counter_received` cannot be marked withdrawn or defective.**
`src/app/admin/dmca/page.tsx` · `src/app/api/admin/dmca/route.ts` ·
`01-auth-access-r8.md`
The UI offers nothing at that status, and the API path for those two actions
stamps the status without undoing the removal.

**13. The DMCA log claims restoration on notices the route explicitly refused
to restore.** `src/app/admin/dmca/page.tsx` · `01-auth-access-r8.md`
The log line is unconditional; the route's restore is not. An admin reading the
log believes material is back when it is not.

**14. The `dmca_notices` status stamp's own error is unchecked.**
`src/app/api/admin/dmca/route.ts` (`update(stamp('material_removed'))`) ·
residual half of `01-auth-access-r5.md`
The listing side of `remove_material` now reports honestly, including partial
quarantine. The notice-status write beside it still discards its error.

## Acceptance (ruling D11)

**15. The gate is enforced in the routes; the tables still accept direct client
inserts.** `src/app/api/messages/route.ts`, `src/app/api/reviews/route.ts` vs
the RLS policies in `00038` and `00012` · `01-auth-access-r3.md`
Everything the product ships posts through the routes. Someone with the anon
key and a stale acceptance could insert a message or review directly. Closing
it properly means a policy that reads `terms_version`, which is a schema change
and therefore exactly the kind of work this list exists to defer.

**16. Listing images can be added, reordered and deleted with a stale
acceptance.** `src/services/listings.ts` · `01-auth-access-r5.md`
The gate is on the PATCH route; the image writes are direct supabase-js calls
that never pass through it.

**17. `acceptance_required` has no consumer in the read endpoint's fail-open
window.** `src/components/legal/AcceptanceInterstitial.tsx`,
`src/app/checkout/[listingId]/page.tsx` · `01-auth-access-r8.md`
Messages handles the code and reopens the interstitial; checkout does not, so
in the narrow window where the read endpoint fails open the 403 points at a
banner that is not on screen.

---

## Deferred by ruling, not by triage (D13)

These were scoped out of L8 deliberately and are not defects:

- The artist-side "mark received" control.
- The day-5-of-7 return reminder cron.
- Full return status on both order cards (buyer's and artist's).
