# Custom Canvas — Stripe Implementation Plan

Paste into Claude Code from the repo root. Context first, then tasks in order.

---

## Decisions already made (do not relitigate)

- **Destination charges stay.** The platform is merchant of record. Keeps Stripe Tax
  money in the platform account for Texas marketplace-provider remittance, and puts
  CUSTOM CANVAS on the buyer's card statement instead of the artist's name.
  Do NOT convert to direct charges.
- **Express connected accounts with Stripe-hosted onboarding stay.** Artists enter
  their own SSN and bank details on Stripe's domain. The platform never sees them.
- **Buyer covers Stripe's processing fee** via the `Service fee` line. Already
  implemented — see Task 0.
- **Platform commission is 15% of the artwork price**, not of shipping.
- **Artists are paid `price − commission + shipping`.**

## Already changed (verify, don't redo)

`src/utils/commissionCalc.ts` and `src/utils/commissionCalc.test.ts` were rewritten so
the buyer fee grosses up to cover Stripe exactly:

```
fee = ceil((0.029 * (price + shipping) + 30) / (1 - 0.029))
```

`BUYER_FEE_RATE` and `BUYER_FEE_CAP_CENTS` are gone, replaced by `STRIPE_PERCENT` and
`STRIPE_FIXED_CENTS`. `calcBuyerFee` now takes `(priceCents, shippingCents)`.

---

## Task 0 — Get the suite green

`src/utils/orderRecord.test.ts` still asserts the old capped-fee amounts and the old
invariant `artist_payout + platform_fee === buyerTotal`. That invariant is no longer
true: the buyer fee now passes through to Stripe rather than landing with the platform.

Update it to the new invariant:

```
artist_payout_cents + platform_fee_cents + buyer_fee_cents === buyerTotal
```

Run `npm run lint`, `npx tsc --noEmit`, and `npx vitest run`. All three clean before
moving on.

## Task 1 — Stop booking the buyer fee as platform revenue

`src/utils/orderRecord.ts` writes:

```ts
platform_fee_cents: split.platformCommission + lockedFee,
```

The buyer fee is now a pass-through to Stripe, not income. Left as-is, the admin
dashboard and every report built on `platform_fee_cents` overstate revenue by exactly
what Stripe took — which matters because the founders do their own books.

Change to:

```ts
platform_fee_cents: split.platformCommission,
```

`buyer_fee_cents` already stores the fee separately, so nothing is lost. Update
`orderRecord.test.ts` accordingly. Check `src/app/admin/orders/page.tsx` and
`src/app/api/admin/stats/route.ts` — both sum this column; confirm the labels there
still read correctly as platform revenue.

## Task 2 — Fix the artist onboarding gate

`src/app/api/webhooks/stripe/route.ts`, `account.updated` handler, gates on
`account.charges_enabled`. That is the wrong signal for this integration.

Under destination charges the artist never creates charges — the platform does, then
transfers. What the artist's account actually needs is the **transfers** capability
and a working payout destination. An account can have `charges_enabled: true` while
`payouts_enabled` is false (no bank account attached), in which case money piles up in
their Stripe balance and never reaches them.

Gate on both instead:

```ts
const ready =
  account.payouts_enabled &&
  account.capabilities?.transfers === 'active';
if (ready) { /* set stripe_onboarded */ }
```

Also handle the reverse: if an artist's account later falls out of good standing,
`stripe_onboarded` should flip back to false so checkout blocks cleanly rather than
failing at transfer time.

## Task 3 — Lighten artist onboarding

`src/app/api/payments/stripe-connect/route.ts` requests both capabilities:

```ts
capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
```

`card_payments` is unnecessary for destination charges and forces every artist through
full merchant KYC instead of the lighter recipient flow. Drop it:

```ts
capabilities: { transfers: { requested: true } },
```

This measurably reduces onboarding abandonment. Verify against a fresh test account
that Stripe-hosted onboarding still collects a bank account with `transfers` alone.

## Task 4 — Delay artist payouts

Chargebacks arrive weeks after delivery. If the artist's money is already in their
checking account, a dispute leaves their Stripe balance negative and creates an
artist-relations problem.

On account creation, set a payout delay:

```ts
settings: { payouts: { schedule: { interval: 'daily', delay_days: 14 } } }
```

If the platform's Connect configuration does not permit setting `delay_days`, fall
back to `interval: 'manual'` plus a scheduled job that pays out orders whose status
has been `delivered` for 7+ days. Log which path was taken in `DECISIONS.md`.

## Task 5 — Disclose the service fee

The fee formula lives in the counsel documents (Terms of Sale §2, published from
`docs/legal/website legal documents/markdown/` since L1 — do not hand-write it into a
page) and in the notice above the Pay button. Required wording points:

- The service fee covers payment processing.
- It applies to **every order regardless of payment method**.
- It is retained on a **change-of-mind** refund and **returned in full** on a fault
  refund — never shipped, lost in transit, damaged, materially not as described, an
  obvious pricing/tax error, or an artist cancellation (Terms of Sale §2, Artist
  Agreement §8; implemented in L6 / migration 00061). Copy that calls the fee flatly
  "non-refundable" contradicts the counsel documents.

That second point matters legally: a fee applied only to card payments is a surcharge,
which carries card-network disclosure rules, a rate cap, and outright bans in a few
states. A flat service fee on all orders is not a surcharge. Do not write copy that
describes it as a card fee.

## Task 6 — Fraud and dispute hardening

Code side:

- Include the artist's name and the string "This will appear as CUSTOM CANVAS on your
  statement" in `sendOrderConfirmationEmail`.
- Add a `tracking_number` and `signature_confirmed` field to orders, surfaced in the
  artist's shipping flow. Signature confirmation is what wins "item not received"
  disputes on high-value pieces.

Dashboard side (not code — for the founders):

- Radar rule requiring 3D Secure above ~$500. 3DS shifts fraud-dispute liability to
  the card issuer entirely.
- Radar rules blocking CVC and postal-code mismatches.

## Non-goals

- Do not convert to direct charges.
- Do not switch to embedded Connect components. The `type: 'express'` redirect flow
  stays; the cost is ~$68/month at ten active artists, far below the build cost.
- Do not touch `NEXT_PUBLIC_PAYMENTS_ENABLED`. It stays `false` until the Stripe
  checklist below is complete and a test purchase has passed.

## Definition of done

`npm run lint` clean · `npx tsc --noEmit` clean · `npx vitest run` green ·
`npx playwright test` green · `DECISIONS.md` updated with the fee-model change and the
`platform_fee_cents` semantic change.

---

# Stripe dashboard checklist (humans, not Claude Code)

Live account `acct_1ThZvPGmzNKy5sGb`. Already done: activation approved, payments and
payouts capabilities active, statement descriptor, support email, phone verified.

1. **Link the business bank account.** Currently empty — payouts have nowhere to land.
   Must be a business checking account in the name "Custom Canvas LLC".
2. **Fix the Connect platform configuration.** It currently declares direct charges,
   `dashboard: none`, and Stripe-collected fees — none of which match the code. Open a
   Stripe support ticket to align it to destination charges with Express dashboard.
3. **Fix the Stripe Tax product category.** It is set to "General — Electronically
   Supplied Services". These are physical paintings. Wrong category means wrong tax on
   every order.
4. **Add the Texas sales-tax registration** once the permit is issued
   (comptroller.texas.gov, free, usually same-day).
5. **Register the webhook** at `https://customcanvas.shop/api/webhooks/stripe` with
   exactly: `checkout.session.completed`, `account.updated`, `charge.refunded`,
   `payment_intent.payment_failed`.
6. **Copy keys into Vercel** — `pk_live_…`, `sk_live_…`, and the `whsec_…` signing
   secret. Edit the existing variables; do not add duplicates.
7. **Redeploy**, confirm the webhook returns 200 to a Stripe test event, then flip
   `NEXT_PUBLIC_PAYMENTS_ENABLED=true` and redeploy again.
8. **Test purchase** end to end before announcing anything.
