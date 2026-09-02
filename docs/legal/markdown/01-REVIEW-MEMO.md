# Content review memo

**To:** Counsel
**From:** Custom Canvas LLC
**Date:** 2026-08-25
**Re:** Draft legal document set — review findings, changes made, decisions required

**This memo was not prepared by a lawyer and is not legal advice.** It is a founder's
review of an internally prepared document set, recording what was changed and why, so
that your time goes to judgement calls rather than to finding the seams.

---

## 1. How to read this set

Start with the **Operational Brief**. It describes what the platform actually does, in
code, including the fee formula, the payout mechanics and the seller-protection logic.
Nothing else in the set can be assessed without it.

Then the four documents that carry the exposure: **Artist Agreement**, **Terms of
Sale**, **Terms of Service**, **Seller Protection**. The remaining policies are shorter
and mostly downstream of decisions taken in those four.

Every business decision embedded in the drafting is marked inline as *[Counsel: …]*
with the reasoning that produced it. There are no blanks to fill: each question is
answered in the text so that you edit rather than originate, but every answer is
overrulable.

## 2. The four findings that matter most

**A. The shipping window is a legal promise, not a service level.** Every listing
displays a 5-business-day shipping window, and Custom Canvas is the merchant of record.
That appears to bring the sale within the FTC's Mail, Internet, or Telephone Order
Merchandise Rule, which requires a seller who cannot ship in the promised time to get
the buyer's agreement to a new date or refund them promptly. The live product treats a
late shipment as a conversation between the buyer and the artist, with no cancellation
right and no mechanism for Custom Canvas to refund without artist approval. The drafts
add that right. **The code does not implement it yet.**

**B. Seller Protection promises artists something the platform cannot deliver.** The
protection rules say a local pickup order is protected once both parties confirm the
handoff in the message thread. That confirmation feature has not been built, so every
pickup order currently evaluates as unprotected. Publishing the rule as written would
tell artists they are covered when the system has already decided they are not. Related:
delivery confirmation is artist-attested rather than read from a carrier, which means a
condition of protection is currently self-certified. Both are now disclosed in the
artist-facing text. Both disclosures are commercially unwelcome and, in my view, not
optional.

**C. Merchant of record plus a total warranty disclaimer.** We are the buyer's
counterparty for the goods and simultaneously disclaim every warranty about
authenticity, attribution, condition, value and provenance. The disclaimer is drafted to
be conspicuous and names merchantability, but a disclaimer does not answer a Texas DTPA
claim built on a representation, and the listing text is hosted by us. The mitigation
already in the drafts is the promise to refund a substantiated misdescription regardless
of the artist's view. **Please rule on whether that is sufficient, or whether the
structure should change so the artist is seller of record for the goods while Custom
Canvas remains merchant of record for payment only.** This is the question I would most
like an hour of your time on.

**D. The buyer's checkout document contained no dispute-resolution clause.** Arbitration,
the class waiver and the opt-out all lived in the Terms of Service. The Terms of Sale is
what a buyer accepts at the Pay button. A new §9 now incorporates them expressly.
Confirm that incorporation binds.

## 3. Corrections of fact

- **Texas breach notification.** The privacy draft gave 60 days for both individual and
  Attorney General notice. The AG deadline is 30 days, at a threshold of 250 or more
  Texas residents; individual notice stays at 60. Corrected, and flagged for you to
  verify against the current statute.
- **Service fee.** Described to buyers as "roughly 3%". The formula includes a fixed
  per-order component, so the effective rate on a small order is materially higher.
  Now described accurately.
- **Insurance.** Artists were required to insure every shipment "for at least the
  artwork price". Carriers restrict or exclude cover on one-of-a-kind artwork well below
  the value of a significant piece, so for higher-value work that obligation cannot be
  performed. Now framed as insurance to the extent cover is available, with a push to
  fine-art shippers above carrier limits.
- **Internal contradiction on resale.** Prohibited Items forbade selling work you did
  not make, then permitted vintage and estate work as a restricted category. Resolved in
  favour of prohibition at launch, consistent with the no-secondary-market position.
- **Commissions.** The Terms of Service forbade off-platform transacting while the same
  set said commissions are arranged and paid off-platform at launch. Carved out.
- **Artist Agreement §4.5** said "Requirements 5 is measured". Fixed.

## 4. Substantive additions

- **Recovery of a negative balance.** Nothing gave Custom Canvas a route to a shortfall
  once a reversed payout had emptied an artist's Stripe balance. Added: set-off against
  future payouts, plus a right to hold payouts or place a reserve pending investigation.
- **Abandoned orders.** Added a path to cancel and refund where an artist neither ships
  nor responds.
- **Minimum age raised from 13 to 18** for every account. Reasoning in Terms of Service
  §2, including the Texas SCOPE Act point. Please confirm.
- **Rights appeals** added to the privacy policy, with an escalation route to the Texas
  Attorney General, alongside a Global Privacy Control statement.
- **NCMEC reporting** stated in the Community Guidelines.
- **1099-K filing responsibility** flagged: charges are created on the Custom Canvas
  account, so we may be the payment settlement entity rather than a beneficiary of
  Stripe's filing.

## 5. Three drafts describe behaviour that does not exist yet

Marked inline, and repeated here because publishing any of them ahead of the code would
create the exposure it was meant to close:

1. The buyer's cancellation right when the shipping window is missed.
2. Refund of the service fee on a fault-based refund. The refund code currently retains
   the fee on every refund without exception.
3. Unilateral refund of an abandoned order.

## 6. The cheapest item on the list

Registering a **DMCA designated agent** with the Copyright Office costs $6 and takes
about twenty minutes. Without it there is no §512(c) safe harbor for a platform whose
entire product is user-uploaded images. It renews every three years. Nothing else here
has that ratio of cost to consequence.

---

*Questions: support@customcanvas.shop*
