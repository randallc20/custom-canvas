# Live test round — pre-flight (Chris only)

*Companion to `docs/LIVE-TEST-PLAN.md`, which is the tester-facing document.
Verified against production on 2026-08-25: prod is serving `f25587d`,
migrations through 00042 applied, and the database is effectively empty.*

## Production, as of today

| Thing | State |
|---|---|
| Site | `https://customcanvas.shop`, serving `f25587d` |
| Database | `profiles` = **1 row** (`support@customcanvas.shop`, role `user`). 0 artists, 0 listings, 0 orders, 0 services. Tags seeded. |
| **Admin account** | **None exists.** No profile on prod has `role = 'admin'`. |
| Payments | **Off.** `NEXT_PUBLIC_PAYMENTS_ENABLED` is unset — `/api/payments/checkout` returns 403 "Purchasing is not open yet", and listing pages show "Purchasing opens soon". |
| Auth email | Custom SMTP is live (Resend, `noreply@customcanvas.shop`), **email confirmation is required** (`mailer_autoconfirm = false`), Turnstile captcha is on. LAUNCH.md §2 is done — update it. |
| Site URL / redirects | `https://customcanvas.shop` + `/**` allow-list. Correct. |

## Blockers — the test round cannot start until these are done

### 1. Stripe live mode (LAUNCH.md §1, in full)

The plan has the tester buying with a real card, so every item in LAUNCH.md §1
has to land first:

- [ ] Activate the account (LLC + bank).
- [ ] Enable Connect (Express) in live mode.
- [ ] **Run one live-mode `accounts.create` probe before the tester reaches step
      6.7.** The Accounts-v1 compatibility flag only showed a Test-mode row. If
      live rejects v1, artist onboarding dies at exactly the step the tester is
      told to do first, with real identity details already typed in. Ask me to
      run the probe the moment live keys exist.
- [ ] Stripe Tax: origin address + Texas registration.
- [ ] Live keys into Vercel prod (`STRIPE_SECRET_KEY`,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- [ ] Live webhook → `https://customcanvas.shop/api/webhooks/stripe` with all six
      events including `charge.dispute.created` / `charge.dispute.closed`.
      `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
- [ ] Branding assets from `brand/stripe-branding/` — the tester is asked at
      steps 6.7 and 9.5 whether the Stripe pages look like Custom Canvas, so
      upload these first or the answer is a foregone "no".
- [ ] `NEXT_PUBLIC_PAYMENTS_ENABLED=true` + redeploy.

### 2. Create and promote an admin account

There is no admin on production. Until there is, the tester's artist application
sits in a queue nobody can see, and Parts 5, 12 and 13 are dead.

The plan (step 1.5) has the tester register `their+admin@…` as an **Art Lover**
and message you. Then:

```sql
update profiles set role = 'admin' where email = 'THEIR+admin@example.com';
```

Have them sign out and back in afterwards — the role is read at sign-in.

Doing it this way rather than handing over a pre-made account means they own the
password and the inbox, and the registration flow itself gets tested.

### 3. Decide who does the artist's Stripe onboarding

Live Express onboarding collects legal name, DOB, address, SSN last four and a
bank account. Step 6.7 tells the tester they can hand that step to you instead.
Decide before you send the document, and tell them which it is — otherwise they
hit it cold and either stall or over-share.

Whoever's bank it is, that's where the ~$22 payout lands, and it lands 14 days
later. Worth confirming it does.

## Should-fix before sending

These are real gaps the plan currently works around. Each one costs the tester
time or produces a finding you already know about.

### A. New artists and partners have no route into their own setup wizard

`/onboarding/artist` and `/onboarding/gallery` are only reachable from the
"Check Your Email" screen's *"Already confirmed? Continue to setup"* link. A
tester (or a real artist) who clicks the confirmation email in another tab —
which is what everyone does — signs in and lands on:

- **Artists:** `/studio` with `artist` null. No checklist, no banner, no prompt.
  Bare stat cards reading zero. `src/app/(artist)/studio/page.tsx:47` only
  renders the checklist when an `artist_profiles` row exists.
- **Partners:** `/dashboard` showing "Pending Review (Gallery)" for a gallery
  that was never created. `GalleryDashboard` reads `gallery?.partner_type ?? 'gallery'`.

A one-line redirect in each — no profile row → send to onboarding — closes it.
Steps 4.2 and 12.1 currently tell the tester to type the URL by hand and report
that they had to.

### B. Local pickup can never be confirmed

`POST /api/orders/[id]/confirm-pickup` (shipped in `f25587d`) has **no caller
anywhere in the app** — no button for the buyer, none for the artist. So:

- every pickup order evaluates as `ineligible` for seller protection, which is
  the exact failure that commit set out to fix;
- pickup orders never auto-mark delivered, so the buyer can never leave a review
  on one.

Listed in the tester's "don't report these" section as a known gap. It only
needs a button on each side of the order.

### C. Unsubscribe promises a preferences screen that doesn't exist

`/api/unsubscribe` sets all four `email_preferences` to false, and the
confirmation page says *"You can re-enable categories anytime in your account."*
`/account` has profile, password and delete — no email preferences at all. Step
8.15 asks the tester to go and look, so this comes back as a finding unless it's
fixed.

## Nice to have before they start

- [ ] Upstash Redis in Vercel prod — rate limiting is inert without it, and the
      tester's "don't report these" list already warns about burst limits.
- [ ] Sentry alert rules + BetterStack monitor, so a failure during the round
      leaves a trace you can find from the tester's "roughly when" timestamp.
- [ ] Seed nothing. The plan is written for an empty site on purpose — Part 3
      tests the empty states, which real visitors will see in week one.

## After the round

- [ ] Collect the bug log and the three closing questions (Appendix B).
- [ ] **Wipe production.** Auth users as well as table rows, or the tester's
      addresses can't be reused. Storage buckets too — listing images, avatars,
      banners and chat attachments all persist independently of the rows.
- [ ] Re-verify the wipe: `profiles` back to the support row only, and the
      buckets empty.
- [ ] LAUNCH.md §4 — rotate every key that was ever shared in a development
      chat.
- [ ] Only then start reaching out to real artists.
