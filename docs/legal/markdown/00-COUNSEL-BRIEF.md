# Custom Canvas — operational brief for counsel

**Status: factual description, not a legal document.** Written 2026-08-25 from the
production code, database schema and Stripe configuration, so that drafting rests on
what the platform actually does rather than on a summary. Every number here is
enforced somewhere in code; where a policy exists only as intent, it says so.

Custom Canvas LLC · Texas · 3120 Southwest Freeway, Ste 101 #991985, Houston TX 77098
Platform: customcanvas.shop · support@customcanvas.shop

---

## 1. What the business is

A two-sided marketplace for **original physical artwork** by local (currently Houston)
artists. Artists list work; buyers purchase; the artist ships directly to the buyer.
Custom Canvas never takes possession of any artwork.

At launch: ~15–25 artists, invite-reviewed. No secondary market, no auctions, no
digital-only goods, no NFTs.

## 2. The money flow — this drives most of the legal exposure

**Custom Canvas is the merchant of record.** Payments run on Stripe using
**destination charges**: the charge is created on the Custom Canvas Stripe account,
and a fixed transfer amount is routed to the artist's connected account at capture.
The buyer's card statement reads `CUSTOM CANVAS`. Artists never create charges and
never hold the buyer relationship.

For a sale of price `P` with shipping `S`:

| Component | Formula | $1,000 + $40 example |
|---|---|---|
| Artist payout | `P − 15% of P + S` | $890.00 |
| Platform commission | `15% of P` | $150.00 |
| Buyer service fee | `ceil((0.029 × (P+S) + 30¢) / (1 − 0.029))` | $31.38 |
| Sales tax | Stripe Tax, on P + S + fee | varies |

The buyer pays `P + S + fee + tax`. The service fee is a **pass-through sized to
cover Stripe's card processing**, not platform revenue — it is charged on every
order regardless of payment method, deliberately framed as a service fee rather than
a card surcharge. Platform revenue is the 15% commission alone.

**The 85/15 split is disclosed to artists, not to buyers.** It appears in the Artist
Agreement and in the artist's Studio; it appears on no buyer-facing surface.

**Payouts.** Artist connected accounts are Stripe **Express**, created with the
`transfers` capability only (no `card_payments`), on a **daily payout schedule with a
14-day delay**. The delay is deliberate: disputes arrive weeks after delivery, and the
buffer keeps funds in the artist's Stripe balance long enough that a reversal doesn't
overdraw their bank account. Payments are **card-only** (Apple Pay and Google Pay
included); BNPL and bank debit are disabled.

## 3. Refunds

Refunds are **artist-mediated**. There is no buyer self-serve cancel or return.

1. Buyer requests a refund in the message thread with the artist.
2. Artist approves in Studio (this moves no money).
3. A Custom Canvas admin settles it.

On settlement the buyer receives **price + shipping + the sales tax attributable to
those amounts**. The **service fee and the tax on the fee are retained**. The artist's
payout is reversed exactly, and the platform returns its commission.

A never-shipped piece returns to the market automatically; a shipped or delivered
piece does not — it stays sold and the artist relists by hand if the work comes back.

**Three gaps between this flow and the drafts, all requiring code changes before the
corresponding document is published:**

1. **There is no non-delivery path.** If an artist simply never ships, nothing in the
   product cancels the order or refunds the buyer without the artist's approval. The
   buyer's only remedy today is a chargeback. The drafts give buyers a cancellation
   right when the 5-business-day window is missed and give Custom Canvas the power to
   refund an abandoned order unilaterally.
2. **The service fee is retained on every refund**, including where the platform itself
   substantiates that a piece was damaged, misdescribed or never sent. The drafts refund
   it in those cases and retain it only on change-of-mind refunds.
3. **The 5-business-day window is a promise, not a right.** It is displayed on every
   listing, which is what makes the FTC's mail-order rule bite; see question 9 below.

## 4. Seller protection — built 2026-08-25, currently undocumented to artists

The platform now decides, per order, whether the artist or Custom Canvas bears a
chargeback. **This is the largest gap between what the code does and what any
document says.**

The bargain: the artist bears a chargeback **by default**. Custom Canvas absorbs it
instead when the order was *Protected*. An order is Protected when **all** of:

1. Shipped within **5 business days** of purchase (platform-wide default; not
   artist-configurable, and surfaced on the listing page to buyers)
2. A tracking number from a supported carrier (**USPS, UPS, FedEx, DHL**) was recorded
3. Delivery was confirmed
4. **Signature confirmation** obtained, for orders of **$750 or more**
5. The listing carried at least **3 photographs** and a description of at least
   **150 characters** *at the time of sale*
6. No buyer message went unanswered for more than **3 business days**

Local pickup orders are Protected only when handoff is confirmed in the thread —
**that confirmation mechanism is not yet built, so pickup orders currently evaluate as
ineligible.**

Requirements 5 and the fulfillment window are **snapshotted at checkout** and frozen
against modification, because listings remain editable after sale and would otherwise
allow retroactive qualification. Signature confirmation is settable only by the
platform, not the artist — the platform absorbs protected losses, so self-attestation
would let an artist shift losses onto Custom Canvas.

**Known limitation for counsel:** delivery confirmation is currently *artist-attested*
(no carrier API integration). For orders under $750 an artist can self-certify
delivery. The $750 signature rule bounds the exposure.

## 5. What artists agree to today

Acceptance is recorded as `agreement_accepted_at` + `agreement_version`, frozen after
first set, and re-verified server-side when the artist submits for review. A version
bump forces re-acceptance. Buyers accept Terms at signup (`accepted_terms_at`) and see
a Terms-of-Sale notice directly above the Pay button.

Artists also separately accept **Stripe's Connected Account Agreement** during Express
onboarding — a contract Custom Canvas is not party to but depends on.

Artists pass through an **approval gate**: they build a shop in draft, submit for
review, and an admin approves or rejects with a reason. Nothing of theirs is publicly
visible until approved.

## 6. Tax

Stripe Tax is enabled with automatic calculation. Custom Canvas holds a **Texas sales
tax registration** (permit application filed; number expected ~1 week from this date)
and is registered nowhere else. Tax is sourced from the **shipping destination**, so a
Texas delivery is taxed at the Texas rate regardless of where the card is billed, and a
delivery to a state where Custom Canvas has no nexus is taxed at zero.

As a **Texas marketplace provider**, Custom Canvas collects and remits on behalf of its
sellers. Texas requires the provider to **certify to marketplace sellers** that it is
assuming this responsibility — that certification should appear in the Artist
Agreement. Artists selling exclusively through Custom Canvas generally do not need
their own Texas sales tax permit.

Stripe issues **Form 1099-K** to connected accounts. Note that card transactions are
reportable with no minimum threshold, so artists may receive one for small amounts.

## 7. Data and processors

| Processor | Purpose | Data |
|---|---|---|
| Supabase | Database, auth, file storage | Account, listings, orders, messages, uploads |
| Stripe | Payments, payouts, tax, identity | Payment data, artist KYC, bank details |
| Resend | Transactional email | Email address, message content |
| Vercel | Hosting, analytics, speed insights | Request/usage data |
| Sentry | Error monitoring | Error context, may include identifiers |
| Cloudflare Turnstile | Signup/login CAPTCHA | Challenge data |
| BigDataCloud | Reverse-geocoding for the location picker | **Device coordinates** |
| zippopotam.us | ZIP → city lookup | ZIP code |

Collected: name, email, avatar, artist profile content, listings and images, orders
including **shipping address and recipient name**, messages and attachments, reviews,
notifications, and lightweight analytics events (listing views, saves).

**Location:** the buyer's chosen city is stored in **browser localStorage only** — never
on an account. Geolocation is opt-in and the picker discloses that coordinates go to a
third-party geocoder.

Custom Canvas does not sell personal data. Email addresses are restricted at the
database level and are not readable by other users.

## 8. Questions counsel should rule on

1. **DMCA safe harbor.** The platform hosts user-uploaded artwork and has **no
   designated agent registered** with the Copyright Office. Registration is $6 and must
   be renewed every three years; without it there is no §512(c) safe harbor.
2. **Texas Artists' Consignment Act** (Occupations Code ch. 2101). Custom Canvas never
   takes delivery of artwork, which appears to put it outside the statute — but it *is*
   merchant of record and *does* hold sale proceeds before payout. Does that make it an
   "art dealer" holding proceeds for the artist's benefit?
3. **VARA / moral rights.** The Agreement takes a licence to display and promote works.
   Attribution and integrity rights are not waivable except by signed writing. Does the
   display licence need an express carve-out?
4. **Arbitration and class-action waiver** — currently absent from every document.
5. **Limitation of liability** — currently a single sentence, with no cap.
6. **AI-generated work.** No policy exists. Human authorship is required for copyright,
   and non-disclosure to buyers may be actionable misrepresentation. Custom Canvas
   should decide whether to prohibit, or permit with mandatory disclosure.
7. **Authenticity.** Nothing currently defines "original", or governs prints, editions
   or reproductions. This is where "not as described" disputes originate.
8. **Insurance and risk of loss.** No document states when title and risk pass, who
   insures a piece in transit, or who bears a damage claim. The drafts place risk on the
   artist until delivery, which is stricter than the default rule for shipment
   contracts. Note also that the v1.0 obligation to insure "for at least the artwork
   price" is not performable at higher values: the major carriers restrict or exclude
   cover on one-of-a-kind artwork well below the price of a significant piece, so the
   drafts require insurance to the extent cover is available and push higher-value work
   to a fine-art shipper.

### Added in this revision

9. **FTC Mail, Internet, or Telephone Order Merchandise Rule (16 C.F.R. pt. 435).**
   Every listing displays a 5-business-day shipping window, and Custom Canvas is the
   merchant of record. That appears to make the window the "promised time" under the
   rule, which requires a seller who cannot meet it to obtain the buyer's consent to a
   revised date or issue a prompt refund. The live product treats a late shipment as a
   conversation between buyer and artist. The drafts convert it into a buyer-side
   cancellation right. **This is the largest compliance gap in the set and it needs a
   code change, not only a document change.**
10. **Merchant of record versus the warranty disclaimer.** We are the buyer's
    counterparty for the goods and simultaneously disclaim every warranty about them.
    Is the DTPA exposure adequately mitigated by the substantiated-misdescription refund
    promise, or should the structure change so the artist is seller of record for the
    goods while Custom Canvas remains merchant of record for payment only?
11. **Minors.** v1.0 allowed 13-year-old account holders. The drafts raise the minimum
    to 18 for all accounts. Confirm, and confirm the Texas SCOPE Act analysis: if
    under-18 accounts are permitted, the platform knowingly hosts minors and inherits
    duties it has built nothing to satisfy.
12. **Service fee characterisation.** The fee is framed as a service fee applying to all
    orders rather than a card surcharge, which is what keeps it clear of the surcharge
    rules and the prohibition on surcharging debit. Today every payment method is a
    card, so the framing is untested. Confirm it holds, and confirm the fee must extend
    to any non-card method added later.
13. **1099-K filing responsibility.** Charges are created on the Custom Canvas account
    and transferred out. Is Custom Canvas the payment settlement entity for these
    transactions rather than a beneficiary of Stripe's filing? Confirm in writing with
    Stripe and reflect whoever it is in Artist Agreement §9.
14. **Recovering a negative balance.** Nothing in v1.0 lets Custom Canvas recover a
    reversed payout once the artist's Stripe balance is empty. The drafts add a set-off
    right against future payouts and a right to hold payouts or place a reserve pending
    investigation. Confirm the drafting and whether notice or a cap is needed.
15. **Seller protection promises a benefit the platform cannot yet deliver.** The
    artist-facing document says local pickup is protected on confirmed handoff, but the
    confirmation mechanism does not exist, so every pickup order evaluates as
    unprotected. The drafts say so explicitly. Separately, delivery confirmation is
    artist-attested rather than carrier-verified, and the drafts now disclose that too.
    Both disclosures are commercially unwelcome and legally necessary.
16. **Arbitration reaching buyers.** The Terms of Sale is the document accepted at
    checkout and contained no dispute-resolution provision. The drafts add an express
    incorporation of ToS §15. Confirm that incorporation binds a buyer who accepts only
    the Terms of Sale at the Pay button.
