# Decisions

Deliberate choices with lasting consequences, recorded so they read as
choices — not oversights. Newest first.

## 2026-08-24 — The 85/15 split is artist-facing only; click-wrap Artist Agreement

The commission split appears nowhere buyers can see (home stat, About, Terms,
listing pages all swept); it lives in the Artist Agreement
(/artist-agreement, artist-gated) and Studio surfaces. Artists accept the
agreement via required checkbox at onboarding — acceptance is recorded as
`agreement_accepted_at` + `agreement_version` (frozen after set, 00037) and
re-verified server-side at submit-for-review; a future version bump forces
re-acceptance. The agreement's display/marketing license is deliberately
NARROW: no digital-reproduction/tokenization rights (tokenization explored
2026-08-24 and parked post-launch — a v2 agreement would be required first).
Buyers see a Terms-of-Sale notice + statement descriptor directly above the
Pay button. Agreement text is v1 DRAFT pending counsel review.

## 2026-08-21 — Buyer service fee = Stripe processing pass-through (was 5% capped $15)

The buyer fee is now sized to cover Stripe's base processing fee, grossed up
so the percentage Stripe takes on the fee itself is covered:
`fee = ceil((0.029 × (price + shipping) + 30¢) / (1 − 0.029))`.
Examples: $100 → $3.30 · $1,000 → $30.18 · $5,000 → $149.64 (top-end
effective rate 3.0%). It is charged on **every order regardless of payment
method** — deliberately a service fee, not a card surcharge (surcharges
carry network disclosure rules, a rate cap, and state bans).

**Consciously NOT covered by the gross-up** (accepted platform cost, not an
oversight): Stripe's percentage on the tax portion of the charge (~$2.50 on
a $1k Texas sale), Stripe Tax's 50¢/transaction API fee, and
international-card surcharges. `STRIPE_PERCENT` stays 0.029 — do not gross
these in.

## 2026-08-21 — `platform_fee_cents` = commission only

The buyer fee passes through to Stripe, so it is no longer booked as
platform revenue. `orders.platform_fee_cents` records the 15% commission
alone; `buyer_fee_cents` keeps the fee for per-order accounting. Every
report summing `platform_fee_cents` (admin dashboard, stats API) now shows
true platform revenue. Money conservation invariant:
`artist_payout + platform_fee + buyer_fee = buyer total`.

## 2026-08-21 — Stripe Connect stays on Accounts v1 (compatibility flag enabled)

Stripe now steers new platforms to Accounts v2 and rejects v1
`accounts.create` by default; we enabled the **Accounts v1 support** feature
flag rather than migrate a working integration the week before launch. This
is recorded technical debt: v1 runs most Connect platforms and is not being
switched off, but a v2 migration is in this codebase's future. ⚠️ The
dashboard toggle only showed a Test-mode row — **run one live-mode
`accounts.create` before announcing launch** to confirm live permits v1
(LAUNCH.md §5 has the step).

## 2026-08-21 — Artist onboarding: transfers-only capability, 14-day payout delay

Destination charges mean artists never create charges, so `card_payments`
capability (full merchant KYC) is not requested — artists get the lighter
recipient flow (verified in test mode: bank account still collected).
Payouts run `daily` with `delay_days: 14`: disputes arrive weeks after
delivery, and the delay keeps money in the artist's Stripe balance long
enough that a refund reversal doesn't overdraw their bank account. Artists
are told about the delay in Studio → Sales.

## 2026-07-06 — Artist-mediated refunds; service fee non-refundable

Buyer requests via chat → artist approves in Studio → admin settles. Buyer
receives price + shipping + the tax on those amounts; the service fee (and
its tax) is retained; the artist payout is reversed exactly; the platform
returns its commission. (Tax component added 2026-08-18 — merchant-of-record
obligation.)

## 2026-07-24 — Destination charges; platform is merchant of record

Charges are created on the platform account with
`transfer_data.destination`. Keeps Stripe Tax money with the platform for
Texas marketplace-provider remittance and puts CUSTOM CANVAS on the buyer's
statement. Do not convert to direct charges.
