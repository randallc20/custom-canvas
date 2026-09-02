# Custom Canvas Seller Protection

**DRAFT — complete draft for counsel review.** The system described here is **live in production** as
of 2026-08-25; this is the artist-facing document for it, which does not yet exist.

---

**This policy is part of the Artist Agreement**, incorporated into §4 by reference and
versioned with it. It is kept as a separate document because it decides who bears a
chargeback, which is the single term most worth reading properly, and because it is the
term most likely to change as the platform's evidence handling improves.

---

## The principle

Protection is a **bargain, not a benefit**. You bear a chargeback by default. Custom
Canvas covers it instead when you did the things that would have won the dispute.

Every dispute — won or lost — counts against **Custom Canvas's** standing with the card
networks, not yours. One careless sale can jeopardise processing for every artist on the
platform. That is why the requirements are what they are.

## When Custom Canvas covers a chargeback

An order is **Protected** when all of the following are true:

1. **Shipped within 5 business days** of the sale
2. A **tracking number** from **USPS, UPS, FedEx or DHL** recorded before you marked it
   shipped
3. **Delivery confirmed** to the address on the Custom Canvas order and recorded before
   the dispute arrived
4. **Signature confirmation** obtained, for orders of **$750 or more**
5. Your listing carried **3+ photographs** and a description of **150+ characters** — as
   measured *at the time of sale*
6. **No buyer message about the order left unanswered** for more than 3 business days,
   between the sale and confirmed delivery and for any later message about that order

**Two limits to know about before you rely on this:**

**Delivery confirmation is your attestation, not the carrier's.** We do not yet read
tracking from carrier APIs, so marking an order delivered is something you record. It
still has to be true. A false attestation is a breach of the Artist Agreement and
forfeits protection. Carrier verification is coming, and we will tell you before it
changes.

**Local pickup is not eligible today.** The rule is that pickup is Protected when both
parties confirm handoff in the message thread, but **that confirmation feature is not
built yet**, so pickup orders currently evaluate as unprotected. Until it ships, treat
a pickup sale as carrying its own risk, and still get the buyer to confirm the handoff
in writing in the thread. It remains the best evidence available to you.

## Why each requirement exists

They are not arbitrary — each is a piece of evidence a card network actually weighs:

- **Tracking and delivery** are the single strongest defence against "I never received
  it", which is the most common dispute.
- **Signature at $750** matches the card networks' own evidence rules for higher-value
  goods.
- **Photographs and a real description** are what defeats "not as described". A listing
  that says only *"Beautiful abstract in blues, ready to hang"* defends nothing — which
  is exactly why the bar is 150 characters rather than a token minimum.
- **Answering messages** resolves most complaints before a bank is ever involved.

## Requirement 5 is frozen at the moment of sale

Photograph count and description length are recorded **when the buyer pays** and cannot
be changed afterwards. Adding photographs to a sold listing does not retroactively
protect that order — it protects the *next* one.

## Seeing where you stand

Every order in **Studio → Sales** shows its protection standing **before** any dispute
exists, and expands to list precisely what is missing. Anything still fixable is listed
separately from anything already fixed at the point of sale.

## Conceding is free

If a dispute arrives and you would rather accept it than fight it, you pay no penalty
and your record stays clean. Fighting a dispute you will lose costs everyone.

## What happens when a dispute arrives

1. We mark the order disputed and tell you immediately, **stating in the first line
   whether you are protected**.
2. We ask for any shipping or delivery evidence you hold, and we respond to the bank.
3. If we **win**, nothing changes and your payout stands.
4. If we **lose** and the order was **Protected**, Custom Canvas absorbs the loss and
   **your payout is not touched**.
5. If we **lose** and the order was **not Protected**, the payout is reversed.

A reversal can push your Stripe balance negative. That is why payouts run on a 14-day
delay — so the money is usually still in your Stripe balance rather than already spent
out of your bank account.

**If your balance will not cover a reversal**, the shortfall is a debt to Custom Canvas
and we recover it by setting it off against your future payouts. We will tell you the
amount and how it is being recovered. We may also hold a payout or place a reserve
while we investigate a dispute or a claim about a piece, for no longer than the
investigation reasonably needs. See Artist Agreement §4.

## What this does not cover

Protection covers **card chargebacks**. It is not shipping insurance, and it does not
cover a piece lost or damaged in transit — insure your shipments, and note that risk of
loss sits with you until delivery under Artist Agreement §7.

It also does not cover a refund you approved yourself, a refund we make because a piece
was never shipped, or one we make because we substantiated that a piece arrived damaged
or was materially not as your listing described it. Protection is about defending
against a bank; it is not a guarantee against the consequences of a sale that went
wrong.

*Questions: support@customcanvas.shop*
