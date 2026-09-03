# Decisions

Deliberate choices with lasting consequences, recorded so they read as
choices — not oversights. Newest first.

## 2026-09-02 — D6: seller-protection requirement 4 (signature confirmation) waived at launch

Requirement 4 of Seller Protection — signature confirmation on orders of
$750 or more — had no writer anywhere. `signature_confirmed` is frozen for
everyone but the service role (00040: "service-role only until a carrier
integration can confirm it"), and no route, cron, admin page, script or
runbook step sets it. So every order at or above the threshold was
ineligible by construction: an artist who bought USPS Signature
Confirmation, shipped on time with tracking, marked delivered and answered
every message would still lose the payout on a non-receipt chargeback,
while the ship modal told them to "select it when you buy the label" and
the Studio badge listed it under "To protect this order"
(`docs/reviews/04-money-r4.md` P2). The same shape as requirement 3 before
D1, without the ruling.

Taken as R16 with the plan's default: waived at launch. `evaluateProtection`
skips the check while `SIGNATURE_CONFIRMATION_AVAILABLE` is false (the code
path stays; the constant is the switch), the ship modal now recommends
signature confirmation on $750+ orders as evidence rather than demanding it,
and the badge never lists it as something the artist can fix in Studio.
`signature_required` is still snapshotted at checkout so the recommendation
knows when to appear. Re-enable when a carrier lookup or an admin path
(service role, after checking the carrier's signature record at dispute
time) can actually record it — flip the constant, and give the badge and the
runbook the path. Until then a lost non-receipt dispute on a high-value
order that met the other five requirements is a platform cost we accept,
knowingly, rather than one the artist eats for a box nobody could tick.

## 2026-09-02 — D5: a disputed commission is closed by an admin, or withdrawn by the requester who raised it

A commission that reached `disputed` could not leave it. Enumerating every
writer: `accept` needs `pending`, `confirm` needs `quoted`/`delivered`,
`complete` needs `accepted`/`in_progress`, `decline` needs `pending`/`quoted`,
`dispute` needs `in_progress`/`delivered`, the nudge cron only writes
`last_nudge_at`, and 00009 removed the client UPDATE policy. The admin
"disputes" page manages the `reports` table and never reads `commissions`.
So the artist could not deliver, the requester could not confirm or take it
back, and no admin could close it: a permanent red badge on the thread, the
panel and the artist's queue (`docs/reviews/04-money.md` P2).

Taken as R10 with the plan's default. Two exits, both server-side (there is
no client UPDATE policy on `commissions`, so every write goes through a route
under the service role after an explicit check):

- `POST /api/admin/commissions/[id]/resolve` — admin only, `disputed ->
  confirmed | cancelled`, compare-and-swap on `disputed` so two admins cannot
  both close it, `closed_by = 'admin'` and a required `closed_reason` that
  both parties are notified with. Surfaced on a new `/admin/commissions`
  queue, since an admin cannot read other people's commissions from the
  browser at all.
- `POST /api/commissions/[id]/withdraw-dispute` — the requester who raised
  it, restoring `pre_dispute_status` (persisted at dispute time in 00053,
  mirroring what orders do since 00050) rather than guessing between
  `in_progress` and `delivered`.

No money moves in commissions, so this is a workflow unlock, not a payment
one; an admin's decision here does not settle any funds. Two related
corrections ship with it: the dispute reason is stored in its own
`dispute_reason` column instead of overwriting the artist's `artist_notes`
(the quote note it was destroying), and the `updates` route now refuses
`cancelled`/`confirmed`/`disputed`, which were accepting progress updates —
and the buyer emails that go with them — on closed work. Migration 00053.

## 2026-09-02 — Public profile visibility: full_name stays anon-readable, email_preferences and the follow graph do not (ruling D3, default applied)

Review 01-P2 found the anon key could read every user's `full_name`, role,
signup date and `email_preferences`, and every row of `follows`. R8 applied
the plan's default: `full_name`/`avatar_url`/`role`/timestamps stay
anon-readable because artist pages, reviews and chat headers render buyers by
name; `email_preferences` is revoked from `anon` (only the signed-in account
page reads it); `follows` is back to own-row SELECT with the public number
served by `follower_count()` (SECURITY DEFINER, count only). Whether buyer
names should require sign-in is still open for a later ruling; nothing in
the launch surface needs it either way. Migration 00052.

## 2026-09-02 — Seller protection requirement 3: artist attestation of delivery accepted at launch (ruling D1)

Requirement 3 of Seller Protection is met at launch by the artist clicking
Mark Delivered in Studio, not by a carrier scan — there is no carrier
integration yet, and requiring buyer confirmation (the way pickup works)
would leave every shipped order unprotected whenever a buyer simply never
taps. This is the default from `docs/REVIEW-FIX-PLAN.md` D1, taken with eyes
open: the artist-facing wording (policy text, `evaluateProtection`, the
Studio badge) no longer claims the carrier confirms delivery. What changed
to make the attestation honest: `delivered` is no longer client-writable
(the order guard now checks the transition, and only `paid/shipped ->
shipped` is open to the artist), `delivered_at` is stamped server-side by
`/api/orders/[id]/mark-delivered` after an ownership check and frozen for
non-privileged writers (00050) — a once-only, auditable act rather than an
editable timestamp. Revisit with a carrier tracking lookup post-launch;
until then a lost-in-transit dispute on a "delivered" order is a platform
cost we accept.
## 2026-09-02 — D4: a darker terracotta for text; bright terra keeps the accents

The brand terracotta `#E8704A` fails AA as text on every ground in the palette
(2.85 on cream) and so does `terraDark` (3.90), so links, prices, eyebrows and
the primary button label all sat below 4.5:1 (`docs/reviews/03-frontend.md`).
Taken as D4's default with two forced adjustments, both arithmetic rather than
taste:

- The ruling's suggested `≈#B5502E` clears cream (4.70) and white (5.06) but
  not `terraSoft` (4.33) or `sand` (4.17), and text-terra sits on both today.
  `terraText` is therefore `#A84928` — same hue, one step darker — at 5.35 on
  cream, 5.76 on white, 4.92 on terraSoft, 4.74 on sand. `terraTextDark`
  (`#8F3D21`) is its hover step.
- No label colour passes on both the primary button's rest and hover
  background (white/terra 3.07, white/terraDark 4.20; ink/terra 4.66 but
  ink/terraDark 3.40), so the *background* moved: primary buttons and the
  text-bearing terra pills are `terraText` with a `terraTextDark` hover.

Bright `terra` is unchanged wherever it is not behind or beside text —
progress bars, status dots, focus rings, timeline markers, HomeHero's display
type. Success and warning toasts (and with them the success/verified/warning
Badges) are now dark-on-tint. Shipped in R9; the full recomputed table is in
that commit.

## 2026-09-02 — Pickup-order tax sourcing stays on the billing address (OPEN counsel question)

Checkout collects a shipping address only for shipped orders, so Stripe Tax
sources pickup orders from the card's billing address (verified in test mode
2026-09-02: an Oregon billing address on a pickup basket is taxed $0; a
Houston address 8.25%). The artwork changes hands in Texas with the platform
as the Texas-registered merchant of record. Whether Texas treats an in-person
marketplace handoff as sourced to the handoff location is a question for
counsel; until answered, sourcing is left as is and pickup volume is small.
If counsel says origin-sourced: pass the artist's pickup ZIP as the tax
address for pickup sessions. Raised by `docs/reviews/04-money.md`.

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
