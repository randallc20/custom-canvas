# Custom Canvas Seller Protection — policy and implementation

Modelled on eBay's payment-dispute system, adapted for high-value original art.

## The principle

Protection is a **bargain, not a benefit**. The artist bears a chargeback by default.
Custom Canvas absorbs it only when the artist did the things that would have won the
dispute. That costs the platform almost nothing when artists comply, and it makes them
comply — which is the actual goal, because every artist's dispute lands on Custom
Canvas's chargeback ratio, not theirs.

## The policy

> **Custom Canvas Seller Protection.** If a buyer disputes a charge, the amount is
> deducted from the artist's payout. Custom Canvas covers the loss instead when the
> order was Protected at the time of sale and shipment.
>
> An order is **Protected** when all of the following are true:
>
> 1. Shipped within the fulfillment window stated on the listing
> 2. A tracking number from a supported carrier was entered before shipping
> 3. The order was marked delivered to the address on the Custom Canvas order
>    (at launch the artist confirms this in Studio; carrier confirmation will
>    replace it — DECISIONS.md 2026-09-02, ruling D1)
> 4. **Signature confirmation** was obtained, for orders of **$750 or more**
>    (ACTIVE. The artist buys it at the counter; Custom Canvas records it from
>    the carrier's signature record through
>    `POST /api/admin/orders/[id]/signature-confirmed`, and recording it on an
>    already-disputed order re-assesses that order — DECISIONS.md 2026-09-03,
>    ruling **D7**, which supersedes D6's launch waiver)
> 5. The listing carried at least three photographs and written condition notes
> 6. The artist replied to buyer messages within three business days
>
> Local pickup orders are Protected only when both parties confirmed handoff in the
> Custom Canvas message thread.
>
> **Conceding is free.** An artist who accepts a dispute pays no penalty and keeps
> their protection record clean. Fighting a dispute you will lose costs everyone.

Three thresholds are deliberate: **$750** matches eBay and the card-network evidence
rules; **three business days** is enforceable from data already in `messages`; **three
photos** is low enough that no serious artist misses it.

## Data model

Add to `orders` (`tracking_number` and status `disputed` already exist):

| Column | Type | Notes |
|---|---|---|
| `carrier` | text | Enum-checked against supported carriers |
| `shipped_at` | timestamptz | Set when the artist marks shipped |
| `delivered_at` | timestamptz | From carrier webhook, or artist confirmation |
| `signature_required` | boolean | Computed at checkout: `amount_cents >= 75000` |
| `signature_confirmed` | boolean | Proof of signature on delivery. Written by the admin signature route only (D7); frozen for everyone else |
| `signature_confirmed_at` | timestamptz | When it was recorded (00060) |
| `signature_confirmed_by` | uuid | Which admin read the carrier record (00060, FK SET NULL) |
| `evidence_photo_count` | int | **Snapshot at checkout** |
| `evidence_has_condition_notes` | boolean | **Snapshot at checkout** |
| `fulfillment_window_days` | int | **Snapshot at checkout** |
| `protection_status` | text | `pending` / `protected` / `ineligible` / `waived` |
| `dispute_id` | text | Stripe dispute id |
| `dispute_outcome` | text | `won` / `lost` / `accepted` |

**The three snapshot columns are load-bearing.** Listings are editable after sale. If
protection is evaluated against the live listing, an artist can add photos the day a
dispute arrives and retroactively qualify. Freeze the evidence at checkout, in the same
metadata block that already locks the economics.

## Protection evaluation

One pure function, `evaluateProtection(order): ProtectionStatus`, in `src/utils/`.
Deterministic, unit-tested, no I/O. Called at dispute time, and displayed
optimistically in the artist's Studio so they can see their standing before anything
goes wrong.

Local pickup short-circuits: protected only if a system message confirming handoff
exists on the order's conversation.

## Webhook handling

Three new events on the platform-scope destination:

**`charge.dispute.created`**
- Set `status = 'disputed'`, store `dispute_id`
- Run `evaluateProtection`, persist the result
- Freeze any pending payout for this order
- Notify the artist in-app and by email, with the protection result stated plainly and
  a link to accept or contest within five days
- Notify admins

**`charge.dispute.closed`**
- `won` → restore `status`, release the payout hold, clear `dispute_id`
- `lost` + `protection_status = 'protected'` → platform absorbs it. Do **not** reverse
  the transfer. Record it.
- `lost` + `ineligible` → `transfers.createReversal` on the original transfer for
  `artist_payout_cents`, idempotency key `dispute_${dispute_id}`
- `accepted` → same as lost, but never counts against the artist's record

**`charge.dispute.funds_withdrawn` / `funds_reinstated`** — bookkeeping only; log so the
balance is reconcilable.

Reversal can push an artist's balance negative. That is expected and Stripe handles it.
Surface it honestly in Studio rather than letting them discover it in their bank.

## Payout timing

Hold the artist's payout until **delivery confirmed + 7 days**, or **21 days after
shipment** if no delivery scan ever arrives. This is eBay's 90-day hold logic, shortened.

For orders **$2,500 and above**, extend to delivery + 30 days. The exposure is worth
more than the goodwill of paying a week earlier, and artists selling at that level
understand why.

## Per-artist dispute rate

Track disputes ÷ orders per artist on a rolling 90 days. Above **1%**, pause new
listings and require a conversation. This is not punitive — the card networks put
*merchants* into monitoring programs above roughly that ratio, and the merchant here is
Custom Canvas. One careless artist can jeopardise processing for everyone.

## Artist-facing surfaces

- **Studio → Sales**: a protection badge per order, showing what is satisfied and what
  is missing, *before* a dispute exists. "Add tracking to protect this order."
- **Shipping flow**: when `signature_required`, the ship modal states that signature
  confirmation is **required** for protection (Artist Agreement §7) and that Custom
  Canvas records it from the carrier's record if the order is disputed (D7).
- **Refunds**: `orders.refund_reason` decides the split (00061 / L6). A change-of-mind
  refund retains the service fee and its tax and needs the artist's approval; every
  fault reason returns the whole charge and may be settled without them (Artist
  Agreement §8's four exceptions).
- **Artist agreement**: the policy verbatim, plus the payout-delay explanation.
- **Dispute notification**: state the protection result in the first sentence. An artist
  should never have to work out whether they are covered.

## Build order

1. Migration + snapshot columns wired into checkout metadata
2. `evaluateProtection` with unit tests covering each requirement and pickup
3. Dispute webhooks with transfer reversal
4. Studio protection badge and the signature-aware shipping form
5. Payout hold logic
6. Dispute-rate monitoring

Steps 1–3 are what must exist before real money moves. Steps 4–6 can follow the first
sales.

## Not covered by any of this

3D Secure sits upstream: when a buyer authenticates, fraud-dispute liability shifts to
their bank entirely and none of the above runs. It is free, and it is the cheapest
protection available. Set the Radar rule before launch.
