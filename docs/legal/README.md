# Custom Canvas — legal document set

**All documents here are DRAFTS for counsel review. None is in force.**
Prepared 2026-08-25 by Claude, from the production code, database schema and Stripe
configuration. **This is not legal advice.** No document here should be published
without a lawyer's review.

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

**Risk of loss is the one I would most want a second opinion on.** The default rule for
shipment contracts passes risk on tender to the carrier; these drafts deliberately place
it on the artist until delivery. The reasoning is that a buyer whose piece never arrives
disputes the charge and wins, so the loss lands on the seller regardless of what the
document says — stating it plainly makes artists insure for it rather than discover it.
That is a commercial judgement, not a legal necessity, and counsel may prefer the
default with an insurance requirement bolted on.

## Non-document actions

- [ ] **Register a DMCA designated agent** with the U.S. Copyright Office — $6, online
      only, renew every 3 years. Without it there is no §512(c) safe harbor for
      user-uploaded artwork. Nothing else on this list is as cheap or as load-bearing.
- [ ] Texas sales tax permit (filed; expected ~1 week from 2026-08-25)
- [ ] General liability / E&O insurance
- [ ] LLC operating agreement
- [ ] Trademark search on "Custom Canvas"

## Implementation note

These are markdown drafts, deliberately not yet wired into the site. Once counsel
settles the text, each becomes a page under `src/app/(public)/`. Changing the **Artist
Agreement** additionally requires bumping `ARTIST_AGREEMENT_VERSION` in
`src/lib/agreement.ts`, which forces every existing artist to re-accept — the mechanism
already exists and is tested.
