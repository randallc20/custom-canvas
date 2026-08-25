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

## Decisions that must be made before any of this is final

1. **AI-generated work** — prohibit, permit with disclosure, or permit assisted only.
   Affects the Artist Agreement, Authenticity and Prohibited Items.
2. **Risk of loss** — when title and risk pass, who insures, who bears carrier damage.
   Affects Terms of Sale, Shipping and the Artist Agreement, and is currently undefined
   everywhere.
3. **Arbitration and class-action waiver** — in or out. Currently absent.
4. **Limitation of liability** — needs a stated cap.
5. **Does substantiated misdescription override artist refund discretion?**
6. **Data retention periods**, and how "delete my account" reconciles with records that
   must be kept.
7. **Repeat-infringer threshold** for the DMCA policy.

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
