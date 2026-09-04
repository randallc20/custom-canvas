# Tester feedback — round of 2026-09-03/04

Everything the tester reported, in the order they reported it, with what was
actually wrong and where the fix stands. Written as a handoff so this round can
be finished in a clean conversation.

**Live site:** https://customcanvas.shop
**Deployed commit:** `2a754ff` (deployment `custom-canvas-prod-jxulgj59d`, Ready)
**Not deployed:** one commit ahead of `2a754ff` — see "Fixed but not
shipped" at the bottom. Verified, committed, not pushed.

---

## ⚠️ Read this before the tester touches the site again

**Production is on LIVE Stripe keys** (`sk_live` / `pk_live`) with
`NEXT_PUBLIC_PAYMENTS_ENABLED=true`, and **Buy Now** renders on live listing
pages. Pressing it charges a real card, pays real processing fees, and sends a
real payout to a Connect account. That path has never been exercised with live
keys — the money e2e passes against Stripe **test** mode only.

`docs/GO-LIVE-FIRST-PURCHASE.md` exists to be the first live charge, done
deliberately by the owner. Until that walk is done, either tell the tester not
to press Buy Now, or set `NEXT_PUBLIC_PAYMENTS_ENABLED=false` in Vercel for the
tester round (one variable, no code redeploy).

---

## 1. Seller could not reply to a DM ✅ shipped

> "DM from buyer to seller worked, not letting me message back as seller
> though — 'your message didnt send please try again'"

The acceptance gate (ruling D11) was correctly refusing the write: the artist's
`terms_version` was NULL and their `agreement_version` was 1.0. Two bugs made
it unreportable — the toast threw away the server's sentence and showed a
generic retry message, and the interstitial, once dismissed, never came back.

Fixed: the refusal's own text reaches the toast, and the interstitial reopens.
Regression test in `e2e/acceptance.spec.ts`.

## 2. Buyer could not accept a quote ✅ shipped — but see #5

> "Commission request worked, sending quote worked, not letting me accept
> quote"

The accept had actually landed (the row was `in_progress`, updated nine seconds
after the quote). The in-thread quote card kept accepted/declined in local
`useState`, so a reload re-offered **Accept** on a quote already accepted; the
route returned 409 "This commission is not awaiting your confirmation" and the
card threw that sentence away for "Action failed. Try again."

Fixed by deriving the card's state from the commission. **That fix caused #5.**

## 3. Artist profile banner cut off ⚠️ partially shipped, second fix pending

> "artist profiles show up cut off like this" (screenshot of
> `/artist/michelangelo-de-lodovico-mtkj5kiw`)

The editor promises "1440×400 works best" (3.6:1) and previews at that ratio,
but the hero rendered a **fixed** 192/256px height at full bleed — about 5.9:1
on a 1512px laptop, so ~40% of the image was cut, and the crop changed with the
window width.

First fix (shipped): an aspect box at 36:10 instead of a pixel height.
**Still wrong** — measured on the live page afterwards, the banner box is
1512×400 holding a 1511×1007 photo, so only 40% is visible. Artists upload
photographs, not banner strips, and no crop tool exists to make them choose
which 40%.

Second fix (**not shipped**): the image is `object-contain` with a blurred copy
of itself filling the space either side. Nothing is ever cropped; a correctly
sized 1440×400 banner is unchanged, because contain and cover agree at that
ratio. Same fix applied to the partner/gallery hero.

## 4. No way to save a piece while viewing it ✅ shipped

> "you should be able to favorite/save a piece while viewing it full screen
> (you can currently only favorite them from the list view)"

Correct, and wider than reported: the save control had exactly one caller, the
grid card. The listing page had none at all, so the flow was open the piece,
look at it, go back, save it.

Fixed: extracted as `SaveHeart`, added to the purchase panel and to the
full-screen viewer.

## 5. Quote card said "Accepted" with no buttons ❌ REGRESSION from #2, not shipped

> "when I send quote as an artist, it doesn't give me the option to accept or
> decline as buyer, it just says accepted. But in the artist view it still says
> quote sent and you can't move forward"
>
> "After I left the DM and came back it let me accept. And the acceptance went
> through!"

The fix for #2 derived the card from the commission's status, but listed only
the statuses meaning "declined" and treated **everything else** as accepted —
including `pending`, the status of a commission that has only been requested.
Compounding it, nothing refetched the commission when a quote arrived, so a
buyer whose thread was already open still had the `pending` row cached.

Result: the card read "Accepted" with no buttons, the artist sat on "Quote
sent", and neither side could move. Leaving and returning remounted the thread,
refetched the commission, and unblocked it — which is exactly what the tester
observed and is the proof of the diagnosis.

Fixed (**not shipped**): all eight commission statuses named explicitly, with
anything unrecognised falling to *open* — a button the route may refuse is
recoverable, a card with no control at all is not. The thread now invalidates
the commission query whenever a message arrives.

## 6. Artist statement dropdown looked wrong ❌ not shipped

> "the artist statement in that little dropdown box is weird"

When an artist had both a story and a statement, the statement collapsed into a
full-width bordered box with a chevron — the only control of its kind on the
page, sitting under prose, reading as an empty form field.

Fixed (**not shipped**): rendered as a plain headed section like Influences.
One code path instead of two. *Open question for the owner: delete it from the
public page entirely? If so the field should also come out of the edit form
rather than collecting text nobody sees.*

## 7. Avatar clipped by the banner ❌ not shipped (found while investigating #3)

Not reported directly, but visible in the tester's first screenshot. The
avatar overlaps the banner via a negative margin, and the banner is
`position: relative` while the avatar was not — so the banner painted over the
avatar's top half. Predates all of the above. Fixed with a stacking context.

---

## Fixed but not shipped (6 files)

- `src/utils/quoteCardState.ts` + test — every status named (#5)
- `src/components/chat/ChatThread.tsx` — refetch the commission on new
  messages (#5)
- `src/components/artist/ProfileHero.tsx` — contain + blurred fill, avatar
  stacking context (#3, #7)
- `src/components/gallery/GalleryHero.tsx` — same banner fix (#3)
- `src/components/artist/StorySection.tsx` — statement as a plain section (#6)
- `e2e/commissions.spec.ts` — cold-session test `11.3b` (see below)

## The gap these keep falling through

Every one of the tester's findings is a **cold-session** bug: a page that has
been open a while, two people in two browsers, state that went stale between
actions. The e2e suite does everything in one warm session, in order, in
seconds — it cannot see them. The quote-card test written for #2 passed because
it accepted in the same session where the cache was already correct; the exact
path a real person takes was the one nobody exercised.

`11.3b` is the first test of this kind: the buyer's page sits on the thread
*before* the quote is sent and is never reloaded, then asserts the card comes to
life. More of these are needed — that is the highest-value testing work
outstanding.

## Verification state

- Unit: 362 passing, including 8 for `quoteCardState` verified by reverting the
  fix and watching them fail.
- E2E: full suite 17/17 as of `2a754ff`, including `purchase-refund` 11/11
  against Stripe test mode. The commissions spec now passes **18/18** with the
  fixes above and the new cold-session test `11.3b`.
  Four earlier runs were lost to environment faults, none of them in the
  product: nvm PATH in the git hook, a rebuild mid-run, `gate.sh` clobbering
  the e2e build with a captcha-enabled one, and a missing seed step. The runner
  now preflights for a captcha-free build and real seed credentials and aborts
  in seconds rather than reporting eighteen meaningless results — the
  all-skipped case is the dangerous one, because it does not look like a
  failure.
- `db-smoke` green on DEV and prod. No migrations pending.
