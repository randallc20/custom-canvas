# Custom Canvas — legal document set

**All documents here are DRAFTS for counsel review. None is in force.**
Prepared 2026-08-25 from the production code, database schema and Stripe configuration,
and revised after a content review on the same date. **This is not legal advice, and it
was not prepared by a lawyer.** No document here should be published without counsel's
review.

**Three of the changes in this revision describe behaviour the platform does not have
yet** and must not be published until the code matches: the buyer's cancellation right
when the shipping window is missed, refunding the service fee on a fault-based refund,
and the unilateral refund of an abandoned order. They are marked inline.

## Read this first

**[00-COUNSEL-BRIEF.md](00-COUNSEL-BRIEF.md)** — a factual description of how the
platform actually works: the money flow, the fee formula, refunds, seller protection,
tax posture, and every processor that touches user data. Counsel's drafting is only as
correct as their understanding of the mechanics, and this is the part they cannot get
from anywhere else. It ends with eight questions that need a ruling.

## The documents

| Document | Status | Audience |
|---|---|---|
| [artist-agreement.md](artist-agreement.md) | Rewrite of live v1.0 | Artists |
| [terms-of-service.md](terms-of-service.md) | Split from existing Terms | Everyone |
| [terms-of-sale.md](terms-of-sale.md) | Split from existing Terms | Buyers |
| [privacy-policy.md](privacy-policy.md) | Rewrite of live version | Everyone |
| [cookie-policy.md](cookie-policy.md) | New | Everyone |
| [dmca-policy.md](dmca-policy.md) | **New — blocks safe harbor** | Everyone |
| [prohibited-items.md](prohibited-items.md) | New | Artists |
| [authenticity-provenance.md](authenticity-provenance.md) | New | Both |
| [seller-protection.md](seller-protection.md) | New — system is already live | Artists |
| [returns-refunds.md](returns-refunds.md) | New — standalone | Buyers |
| [shipping-policy.md](shipping-policy.md) | New | Buyers |
| [community-guidelines.md](community-guidelines.md) | New | Everyone |

## Decisions taken in these drafts — confirm or overrule

Every open question is now answered in the text rather than left blank, so counsel edits
rather than originates. Each is flagged inline as *[Counsel: …]* with the reasoning. The
seven that carry real business consequence:

| Decision | Position taken | Where |
|---|---|---|
| **AI work** | Wholly generated **prohibited**; assisted permitted **with disclosure** | Agreement §5, Authenticity, Prohibited Items |
| **Risk of loss** | **Artist bears until delivery**; artist must insure for the artwork price | Agreement §7, Terms of Sale §3, Shipping |
| **Misdescription** | **Overrides** artist refund discretion where substantiated | Terms of Sale §5, Returns, Authenticity, Agreement §8 |
| **Arbitration** | **Included**, individually, with small-claims and injunctive carve-outs, a 30-day opt-out and fee-shifting | ToS §15, Agreement §13.6 |
| **Liability cap** | Artists: greater of 12 months' commissions or $500. Everyone: greater of 12 months' transactions or $100 | Agreement §13.3, ToS §13.4 |
| **Retention** | 7 years for order/tax records; 3 years messages; 30 days to delete an account; 90-day backup cycle | Privacy §6 |
| **Repeat infringers** | **3 substantiated notices in 12 months**; immediate for deliberate or large-scale | DMCA |
| **Minimum age** | **18 for every account**, buyer or seller (was 13) | ToS §2, Privacy §9 |
| **Late or unshipped orders** | Buyer may **cancel for a full refund**; we refund an abandoned order without artist approval | ToS of Sale §3, Shipping, Returns, Agreement §7–8 |
| **Service fee on refunds** | Retained on change of mind; **refunded** where a piece never arrived, arrived damaged or was misdescribed | Terms of Sale §2, Returns |
| **Vintage and estate work** | **Not accepted at launch** (was a restricted category, which contradicted the outright prohibition on reselling) | Prohibited Items, Authenticity |
| **Negative balances** | Set-off against future payouts; reserves permitted pending investigation | Agreement §4, Seller Protection |
| **Shipment insurance** | To the artwork price **to the extent cover is available**; fine-art shipper for higher values | Agreement §7, Shipping |

**Risk of loss is the one I would most want a second opinion on.** The default rule for
shipment contracts passes risk on tender to the carrier; these drafts deliberately place
it on the artist until delivery. The reasoning is that a buyer whose piece never arrives
disputes the charge and wins, so the loss lands on the seller regardless of what the
document says — stating it plainly makes artists insure for it rather than discover it.
That is a commercial judgement, not a legal necessity, and counsel may prefer the
default with an insurance requirement bolted on.

## Changes made in the content review, by document

| Document | Change |
|---|---|
| Artist Agreement | Delivery confirmation disclosed as artist-attested; §4.5 typo fixed; message-response requirement bounded in time; **local pickup disclosed as not currently protected**; set-off and reserve rights added; missed-window cancellation duty added; insurance obligation made performable; fourth refund exception (never shipped) and abandoned-order path added; commissions carved out of the off-platform prohibition; 1099-K responsibility flagged |
| Terms of Service | Account minimum raised to 18; commissions carved out of §6; fee described accurately in §10; merchant-of-record versus warranty-disclaimer tension flagged in §13.2 |
| Terms of Sale | Fee described accurately (it is not flatly 3%); non-delivery and late-shipment rights added; fee refunded on fault-based refunds; **new §9 incorporating the arbitration clause**, which the checkout document previously lacked entirely |
| Returns & Refunds | Four non-discretionary refund grounds stated up front; never-shipped section added; merchant-of-record responsibility restated |
| Shipping | Missed-window cancellation right; signature and insurance obligations phrased as duties on the artist; refund right made independent of whether the artist insured |
| Seller Protection | Pickup ineligibility and attestation limits disclosed; response requirement bounded; negative-balance recovery explained; exclusions widened |
| Prohibited Items | Vintage and estate contradiction resolved against acceptance |
| Authenticity | Aligned with the above; service fee included in a substantiated-misdescription refund |
| Community Guidelines | NCMEC reporting stated; commissions exception noted |
| Privacy | **AG breach deadline corrected to 30 days** (individuals stay at 60); rights-appeal process added; Global Privacy Control addressed; children's section replaced with an 18+ section |
| DMCA | Requirement that the published agent details match the Copyright Office record word for word |
| Counsel Brief | Three code-versus-document gaps documented; questions extended from 8 to 16 |

## Non-document actions

- [ ] **Register a DMCA designated agent** with the U.S. Copyright Office — $6, online
      only, renew every 3 years. Without it there is no §512(c) safe harbor for
      user-uploaded artwork. Nothing else on this list is as cheap or as load-bearing.
- [ ] Texas sales tax permit (filed; expected ~1 week from 2026-08-25)
- [ ] General liability / E&O insurance
- [ ] LLC operating agreement
- [ ] Trademark search on "Custom Canvas"
- [ ] **Build the local-pickup handoff confirmation** — until it exists, pickup orders
      are unprotected and the artist-facing document has to say so
- [ ] **Build the non-delivery path** — cancellation right on a missed window, and
      unilateral refund of an abandoned order
- [ ] **Change the refund code** so the service fee is returned on fault-based refunds
- [ ] Carrier tracking integration, to replace artist-attested delivery confirmation
- [ ] Add the AI-disclosure field to the listing form

## Implementation note

These are markdown drafts, deliberately not yet wired into the site. Once counsel
settles the text, each becomes a page under `src/app/(public)/`. Changing the **Artist
Agreement** additionally requires bumping `ARTIST_AGREEMENT_VERSION` in
`src/lib/agreement.ts`, which forces every existing artist to re-accept — the mechanism
already exists and is tested.
