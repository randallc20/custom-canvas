# The first real purchase — Chris's walkthrough

*Written 2026-09-03 at the end of the legal-alignment arc. This is Section D
step 5 of `docs/LEGAL-ALIGNMENT-PLAN.md`, and it is the one part of go-live
that cannot be automated: it is the first time the **live** Stripe keys, the
**live** webhook secret and a **live** Connect account carry this code.*

Everything below happens on **https://customcanvas.shop**, not staging, with a
real card. Budget about 40 minutes, and do not start it late in the day — a
refund can take a few minutes to settle and you want to be awake for the
webhook.

**Do not start until Section D steps 1–4 are done**: the migrations 00058–00065
applied to prod, `./scripts/db-smoke.sh --prod` green, and prod deployed.

---

## Before you begin

- [ ] You are signed in as the **admin** account in one browser.
- [ ] You have a **second, real account** that is not the artist and not the
      admin — a personal email is fine. This is the buyer. It must be a
      separate browser or a private window; a signed-in admin buying from
      themselves tests nothing.
- [ ] The **artist** account has completed Stripe Express onboarding and shows
      as payouts-enabled in Studio.
- [ ] You have a card you are willing to charge ~$20 to and refund.

## 1. The acceptance interstitial (L2, D11)

The first thing you should see on the admin account, and on the artist
account, is **"We've updated our terms"**.

- [ ] It appears unprompted on the first signed-in page load.
- [ ] It names the right documents: an **artist** is asked for the Terms of
      Service and the Artist Agreement; a **buyer** for the Terms of Service
      and the Terms of Sale.
- [ ] "Not now" dismisses it and leaves a banner; browsing still works.
- [ ] Accept on both accounts. It should not come back after a reload.

If a brand-new registration shows this dialog, stop and tell me — that is the
bug 00063 fixed and it would mean prod did not get that migration.

## 2. List a cheap piece

On the **artist** account, publish a listing at **$20 with $5 shipping**.

- [ ] The form now asks for **Condition** (required) and **What is it?**
      (defaults to Original). Fill the condition in — "New, no damage" is a
      complete answer.
- [ ] Leave the mature checkbox unticked.
- [ ] Publish. It should appear in the public feed.

Worth trying once, then undoing: set "What is it?" to **Reproduction** without
the word "print" in the title. It should refuse and quote the Listing
Standards at you.

## 3. Buy it

On the **buyer** account:

- [ ] The listing page says **"Sold by {artist} · Custom Canvas facilitates
      payment"** under the price.
- [ ] Checkout shows a **Seller** row naming the artist, and the money:
      $20.00 + $5.00 + $1.06 fee = **$26.06** before tax.
- [ ] The notice above Pay links **Terms of Sale** and **Shipping, Returns &
      Refunds**, says the fee is kept on a change of mind and returned on
      fault, and says the charge appears as **CUSTOM CANVAS**.
- [ ] Pay with the real card.
- [ ] You land on Orders with the order visible.
- [ ] **Check the buyer's email**: the confirmation says "Sold by {artist}",
      states the arrangement, and links the Terms of Sale and Shipping policy.
- [ ] **Check the artist's email**: the new-sale notice arrived.
- [ ] **Check the card statement / Stripe dashboard**: the descriptor reads
      CUSTOM CANVAS.

⚠️ If the order does not appear within a minute, the **live webhook secret** is
the first thing to check — Stripe Dashboard → Developers → Webhooks → the live
endpoint's signing secret must match `STRIPE_WEBHOOK_SECRET` in prod.

## 4. The change-of-mind refund, end to end (L6, L8)

This is the loop that never existed before this arc, so walk all of it.

**Buyer:** open the order and press **Request a refund**. It opens a message
thread pre-filled with the order number.

**Artist:** Studio › Sales → **Approve refund**.

- [ ] The dialog asks for a **return address**. Press approve with it empty —
      it should refuse.
- [ ] Fill it in and approve.

**Buyer:**

- [ ] The order card shows **"Return authorised · ship it back by {date}"**
      with the address and instructions.
- [ ] The **email** arrived with the same address and date.
- [ ] The thread has the same thing as a system message.

**Admin:** `/admin/orders`.

- [ ] The row says **Awaiting return** and there is **no Settle refund
      button**. This is the gate: the refund must not be settleable yet.

**Buyer:** press **"I've shipped it back"**, enter any tracking number.

**Admin:**

- [ ] The row now says **Return in transit** with a **Received & accepted**
      button. Press it.
- [ ] **Settle refund** now appears. Press it.
- [ ] The reason picker defaults to **Change of mind** and shows **$1.06
      retained**, offering to refund **$27.06** of the $28.21 charged.
- [ ] Switch the reason to **Materially not as described** — it should offer
      the **full $28.21** and say the fee is returned. Switch back.
- [ ] Settle it.

**Then check:**

- [ ] Buyer's Orders shows **"Refunded (change of mind — service fee
      retained)"**.
- [ ] Stripe shows a **$27.06 refund** and a **transfer reversal** of the
      artist's payout.
- [ ] The **listing is back on sale**.
- [ ] The artist's Studio shows the sale reversed.

## 5. A fault refund

You need a second order for this, because a fault refund and a change-of-mind
refund cannot both happen to one order.

- [ ] Buy the relisted piece again on the buyer account.
- [ ] Admin: `/admin/orders` → **Refund…** → reason **Never shipped**.
- [ ] It should settle **without the artist approving anything** and refund
      the **entire charge including the $1.06 fee and all tax**.
- [ ] Buyer's Orders says **"Refunded in full — the piece was never
      shipped"**.

That is Artist Agreement §8's "four exceptions" working. If it demands artist
approval, the reason did not register as a fault reason — stop and tell me.

## 6. What NOT to test with real money

These are real and covered, but exercising them costs more than it proves:

- **The buyer's cancel-for-a-full-refund** on a missed window needs an order
  backdated past five business days. Covered by e2e on staging.
- **The fulfilment-window cron** cancels abandoned orders automatically. Do
  not wait ten business days to watch it; read the first week's Sentry lines
  instead (it logs counts every run).
- **A chargeback.** Never provoke one — disputes count against the platform's
  standing with the card networks whatever the outcome.

## 7. After the walk

- [ ] Delete or hide the throwaway listing.
- [ ] Read the **Sentry** feed for the whole session. Anything at error level
      during a walk that looked fine from the outside is the thing to chase.
- [ ] Note the two orders' ids somewhere — they are the only real prod orders
      and the first thing to look at if anything is off later.
