# Live test round — pre-flight (Chris only)

*Companion to `docs/LIVE-TEST-PLAN.md`, the tester-facing document.
Re-verified 2026-08-26.*

## Production, as of 2026-08-26

| Thing | State |
|---|---|
| Site | `https://customcanvas.shop`, serving `f25587d` — the onboarding/reset fixes are committed on `fix/onboarding-dead-ends` and **awaiting deploy** (blocked on a fresh Vercel token) |
| Database | `profiles` = 1 row: `support@customcanvas.shop`, **role `admin`**, confirmed, password set |
| Payments | **LIVE.** Stripe live account activated + configured (descriptor `CUSTOM CANVAS`, branding, TX tax, both webhook endpoints); `NEXT_PUBLIC_PAYMENTS_ENABLED=true` deployed; Accounts v1 probe passed. Zero live charges so far — the first real purchase is still the proof |
| Auth email | Resend SMTP, confirmation required, Turnstile on |

## Blockers

1. **Fresh Vercel token** — the old one lapsed; the fix branch can't deploy
   without it. Mint at vercel.com → Account Settings → Tokens, scope
   `chrisfrandall-gmailcoms-projects`.
2. **Rotate `sk_live_`** (it passed through chat) → I update Vercel in the same
   deploy.
3. **Confirm `support@customcanvas.shop` receives mail** — send it a test email.
   It's the admin account's only recovery path.
4. **Decide who does the artist's Stripe onboarding** (step 6.7): live Express
   collects DOB, SSN last-4 and a bank account, and the ~$22 payout lands in
   that bank ~14 days later. Tell the tester which way before they start.

## Should-fix before sending

These are real gaps the plan currently works around. Each one costs the tester
time or produces a finding you already know about.

### A. ✅ FIXED (2026-08-26, `fix/onboarding-dead-ends`) — onboarding dead ends

`ArtistSetupGuard` on the `(artist)` layout and a redirect in `GalleryDashboard`
now route anyone without a profile row into their own wizard. Both redirect only
when the row is genuinely absent, never on a query error. Six Playwright cases.
Also fixed in the same commit: the **dead "Complete Setup" button** — an empty
fulfillment-preference select failed whole-schema validation with the error
offscreen on an earlier wizard step; `setValueAs` + `onInvalid` on both forms.
Steps 4.2 / 12.1 of the plan now expect the automatic hand-off.

### B. ✅ FIXED (2026-08-26) — pickup handoff buttons + route hardening

Both sides now have **Confirm pickup handoff** (buyer: Orders; artist:
Sales & Money — which no longer offers "Mark as Shipped" on pickup orders).
The route was also rewritten after review: the confirmation stamp is a single
atomic conditional UPDATE, so concurrent taps serialize instead of leaving the
order stuck at paid, the already-confirmed path self-heals a both-confirmed-
but-undelivered order, and a failed delivered-promotion returns an honest
error. Verified live on DEV: simultaneous buyer+artist confirmations landed
9ms apart and the order still came out Delivered + Protected, with the buyer
offered Leave a Review. Dispute-before-both-confirm deliberately stays locked
(protection evidence must exist when the dispute arrives).

### C. ~~Unsubscribe preferences screen~~ — NOT A GAP (my error)

`/account` renders an `EmailPreferences` component with all four toggles; the
original finding came from a grep that silently failed. Step 8.15 now tests the
unsubscribe → re-enable round trip as a working feature.

### D. Admin password reset — BUILT (2026-08-26)

Every row on `/admin/users` has **Send password reset**: admin-gated endpoint,
`auth.admin.generateLink({type:'recovery'})` under the service role (immune to
the captcha on the public recover endpoint), link delivered via Resend from our
own template. The admin never sees a password or token. Verified on DEV
end-to-end including the 403 for non-admins. This is also the admin account's
own recovery path — **still confirm `support@customcanvas.shop` receives mail.**

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
