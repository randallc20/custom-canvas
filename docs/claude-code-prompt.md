Work through the tasks below in order on this repo. Stop and ask me if any task
turns out to require a decision the plan does not cover.

# Context — decisions already made, do not relitigate

- **Destination charges stay.** The platform is merchant of record: charges are created
  on the platform account with `transfer_data.destination` to the artist. This keeps
  Stripe Tax money in the platform account for Texas marketplace-provider remittance,
  and puts CUSTOM CANVAS on the buyer's card statement instead of the artist's name.
  Do NOT convert to direct charges.
- **Express connected accounts with Stripe-hosted onboarding stay.** Do NOT switch to
  embedded Connect components.
- **The buyer covers Stripe's processing fee** via the `Service fee` line item.
- **Platform commission is 15% of the artwork price**, never of shipping.
- **Artists are paid `price − commission + shipping`.**
- Do NOT touch `NEXT_PUBLIC_PAYMENTS_ENABLED`. It stays false.

# Already changed — verify, do not redo

`src/utils/commissionCalc.ts` and `src/utils/commissionCalc.test.ts` were rewritten so
the buyer fee grosses up to cover Stripe's fee exactly:

    fee = ceil((0.029 * (price + shipping) + 30) / (1 - 0.029))

`BUYER_FEE_RATE` and `BUYER_FEE_CAP_CENTS` are gone, replaced by `STRIPE_PERCENT` and
`STRIPE_FIXED_CENTS`. `calcBuyerFee` now takes `(priceCents, shippingCents)`.

---

# Task 0 — Get the suite green

`src/utils/orderRecord.test.ts` still asserts the old capped-fee amounts and the old
invariant `artist_payout + platform_fee === buyerTotal`. That invariant is no longer
true — the buyer fee now passes through to Stripe rather than landing with the platform.

Update it to:

    artist_payout_cents + platform_fee_cents + buyer_fee_cents === buyerTotal

Then run `npm run lint`, `npx tsc --noEmit`, and `npx vitest run`. All three clean
before moving on.

# Task 1 — Stop booking the buyer fee as platform revenue

`src/utils/orderRecord.ts` currently writes:

    platform_fee_cents: split.platformCommission + lockedFee,

The buyer fee is now a pass-through to Stripe, not income. Left as-is, the admin
dashboard and every report built on `platform_fee_cents` overstate revenue by exactly
what Stripe took. Change it to:

    platform_fee_cents: split.platformCommission,

`buyer_fee_cents` already stores the fee separately, so nothing is lost. Update
`orderRecord.test.ts` accordingly. Then check `src/app/admin/orders/page.tsx` and
`src/app/api/admin/stats/route.ts` — both sum this column. Confirm the labels there
still read correctly now that it means platform revenue alone.

# Task 2 — Fix the artist onboarding gate

In `src/app/api/webhooks/stripe/route.ts`, the `account.updated` handler gates on
`account.charges_enabled`. That is the wrong signal for this integration.

Under destination charges the artist never creates charges — the platform does, then
transfers. What the artist's account needs is the **transfers** capability and a
working payout destination. An account can have `charges_enabled: true` while
`payouts_enabled` is false (no bank account attached), in which case money accumulates
in their Stripe balance and never reaches them.

Gate on both:

    const ready =
      account.payouts_enabled &&
      account.capabilities?.transfers === 'active';

Also handle the reverse case: if an artist's account later falls out of good standing,
flip `stripe_onboarded` back to false so checkout blocks cleanly with the existing
"has not finished setting up payments yet" error, rather than failing at transfer time
with an opaque Stripe error.

# Task 3 — Lighten artist onboarding

`src/app/api/payments/stripe-connect/route.ts` requests both capabilities:

    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },

`card_payments` is unnecessary for destination charges and forces every artist through
full merchant KYC instead of the lighter recipient flow. Drop it:

    capabilities: { transfers: { requested: true } },

Confirm against a fresh Stripe test account that hosted onboarding still collects a
bank account with `transfers` alone.

# Task 4 — Delay artist payouts

Chargebacks arrive weeks after delivery. If the artist's money is already in their
checking account, a dispute leaves their Stripe balance negative.

On account creation, set a payout delay:

    settings: { payouts: { schedule: { interval: 'daily', delay_days: 14 } } }

Stripe restricts `delay_days` depending on platform configuration. **Actually attempt
the API call.** If it is rejected, stop and tell me rather than guessing — the fallback
is `interval: 'manual'` plus a scheduled job paying out orders that have been
`delivered` for 7+ days, and I want to decide that consciously.

# Task 5 — Disclose the service fee

State the fee in `src/app/(public)/terms/page.tsx` and wherever checkout explains
charges. Required points:

- The service fee covers payment processing.
- It applies to **every order regardless of payment method**.

That second point is legally load-bearing: a fee applied only to card payments is a
surcharge, which carries card-network disclosure rules, a rate cap, and outright bans
in several states. A flat service fee on all orders is not a surcharge. Do not write
copy describing it as a card fee or a credit card fee.

Also update `sendOrderConfirmationEmail` in `src/services/email.ts` to include the
artist's name and the line "This will appear as CUSTOM CANVAS on your statement."
A large share of disputes are buyers not recognising a statement line.

---

# Definition of done

`npm run lint` clean · `npx tsc --noEmit` clean · `npx vitest run` green ·
`npx playwright test` green · `DECISIONS.md` updated with two entries: the buyer-fee
model change, and the `platform_fee_cents` semantic change.
