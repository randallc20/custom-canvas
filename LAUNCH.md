# Custom Canvas — Launch Checklist

*Infra appendix to docs/MASTER-PLAN.md (the plan of record) and
docs/GO-LIVE-PLAN.md. Updated 2026-08-18 to reflect reality: production
EXISTS and is live at customcanvas.shop — only the Stripe-live steps and the
final smoke test remain.*

## ✅ DONE (verified 2026-08-18)
- Production Supabase (`custom-canvas-prod`, ref `nxdbmaslsfaestusrapp`)
  exists with **migrations through 00038 applied**; buckets, Realtime, seed
  tags in place. Prod DB pooler host is `aws-0-us-east-2` (DEV is `aws-1`).
- Vercel `custom-canvas-prod` project serves **customcanvas.shop** with prod
  env (Supabase prod keys, Resend on the real domain,
  `EMAIL_FROM=noreply@customcanvas.shop`, Turnstile, Sentry, CRON_SECRET,
  4 crons). Staging (`custom-canvas` project → custom-canvas-chi.vercel.app)
  stays on DEV Supabase + Stripe test as the permanent test bed.
- Resend domain verified for customcanvas.shop.
- **Admin account exists (2026-08-25):** `support@customcanvas.shop` —
  `profiles.role = 'admin'`, email confirmed, password set. It is the only
  account on prod; the whole admin panel is unreachable without it.
- Security migrations live on BOTH databases: profiles/artist_profiles
  column privacy, listing-visibility RLS + child-table follow-through,
  approval gate, artist-agreement columns, and the 2026-08-25 review
  remediation — order-forgery/status-guard/blocking/review-attribution
  (00030–00038).

## 1. Stripe (live mode) ✅ DONE — verified 2026-08-25 ~19:00 CDT

Live account `acct_1ThZvPGmzNKy5sGb` (Custom Canvas LLC, multi-member LLC).
**Activated:** `details_submitted`, `charges_enabled`, `payouts_enabled` all
true; `card_payments` and `transfers` both active; nothing currently due.

*(Historical note: development ran against a Stripe **Sandbox**,
`acct_1ThZvdGrRmxJghNo` — a separate account whose settings never reach live.
Everything below was configured on the live account directly.)*

- [x] Live account activated — EIN 42-3705552, Certificate of Filing 806686806.
- [x] Statement descriptor `CUSTOM CANVAS` (matches the promise on checkout).
- [x] Branding — icon + logo uploaded, primary `#E8704A`.
- [x] Stripe Tax **active** — head office 3120 Southwest Freeway, Ste 101
      #991985, Houston TX 77098; **US-TX registration active**; defaults
      `tax_behavior: exclusive` (changed from `inferred_by_currency` to match
      the configuration the money path was actually tested against),
      `tax_code: txcd_99999999`.
- [x] **Accounts v1 probe PASSED in live.** `accounts.create({type:'express',
      capabilities:{transfers}, payouts:{daily, delay_days:14}})` succeeded;
      throwaway account created and deleted. Artist onboarding works.
- [x] **Two webhook endpoints**, both → `https://customcanvas.shop/api/webhooks/stripe`:
      an ACCOUNT endpoint with the 7 charge/dispute/checkout events, and a
      **CONNECT** endpoint with `account.updated`. Both enabled. Endpoint
      reachability + signature rejection verified live (400 on a bogus
      signature, not 404/500).
- [x] Live keys + both `whsec_` secrets in Vercel prod.
- [x] `NEXT_PUBLIC_PAYMENTS_ENABLED=true` **and redeployed**
      (`dpl_GB2nzwYi4a4Ad499A36aQGNXbnTD`, sha `f25587d5`, READY).
      Verified: `POST /api/payments/checkout` returns 401 Unauthorized, no
      longer 403 "Purchasing is not open yet".

### Open, non-blocking
- [ ] **MCC is `5712`** (furniture / home furnishings). An art marketplace is
      `5971` (art dealers and galleries). Deliberately NOT changed on launch
      night — editing the industry on a freshly activated account can trigger
      re-review. Fix it after the test round.
- [ ] **Rotate `sk_live_`** — it was pasted into a chat transcript to do this
      configuration. Roll it in Stripe and update Vercel.
- [ ] First payout cycle (14-day delay on connected accounts): confirm money
      reaches the test artist's real bank.

## 2. Auth email ✅ DONE (verified 2026-08-25)
- [x] Supabase prod SMTP points at Resend (`smtp.resend.com`,
      sender `noreply@customcanvas.shop`, name "Custom Canvas").
- [x] Email confirmation is required on signup (`mailer_autoconfirm = false`),
      Turnstile captcha enabled on auth endpoints.

## 3. Hardening activations
- [x] Upstash Redis — `UPSTASH_REDIS_REST_URL` / `_TOKEN` are set in Vercel
      prod (global rate limiting active since `31e7a0c`).
- [x] Sentry DSN + CRON_SECRET set.
- [ ] Vercel Analytics + Speed Insights toggles; BetterStack uptime monitor;
      Sentry alert rules.
- [ ] GitHub repo secrets `E2E_BUYER_*` / `E2E_ARTIST_*` (+ optional
      `E2E_DRAFT_ARTIST_*`/`E2E_ADMIN_*` for the approval spec) so CI runs
      the authenticated suites.

## 4. Security rotation (IMPORTANT)
- [ ] Rotate every key that was ever shared in development chat (DEV Supabase
      keys + DB password, Stripe TEST keys, Resend key, Vercel token —
      the Vercel token already lapsed and needs re-minting anyway).
      Prod secrets that were created in dashboards and never left them are
      fine.

## 5. Smoke test on production (Stage 3 of MASTER-PLAN)
- [ ] **FIRST, before anything else:** one live-mode `accounts.create` probe —
      the Accounts-v1 dashboard toggle only showed a Test-mode row, and the
      ugly failure mode is artist onboarding working in test and dying in
      live. If the live call errors, it's a Stripe support ticket (see
      DECISIONS.md). Ask Claude to run it the moment live keys exist.
- [ ] Fresh artist signup → **setup checklist** → Submit for review →
      admin approves from `/admin/applications` → shop is publicly visible.
      Also exercise reject-with-reason → fix → resubmit once.
- [ ] Verify a draft artist's listing/page is NOT publicly reachable
      (anon browser + direct URL).
- [ ] Buyer purchases with a real card (small amount) → order created, tax
      collected for a TX address, artist payout visible in the connected
      account, both emails arrive from noreply@customcanvas.shop, listing
      sold, admin GMV ticks.
- [ ] Fee model verified: 5% service fee (capped at $15) on listing page,
      checkout breakdown, order record, and both confirmation emails.
- [ ] Refund flow: buyer requests via chat → artist approves in Studio →
      admin settles → buyer refunded price+shipping+their tax (fee + its tax
      kept), artist payout reversed exactly, order refunded, never-shipped
      piece relisted.
- [ ] Commission request → quote (in-thread) → accept → progress update →
      notify (no money moves — commissions are off-platform at launch).
- [ ] `npx playwright test` against prod URL — smoke specs green.
- [ ] First Stripe payout cycle (2–7 days): confirm money lands in the test
      artist's real bank during soft launch.

## Known follow-ups (post-launch, non-blocking)
- Email fan-out deliverability upgrade (move batch sends to a queue) at ~10k
  users (GO-LIVE-PLAN §L4).
- Commission deposits (quote flow exists; payment is off-platform today).
- Backlog in `docs/UPDATE_PLAN.md` (collections, "view in a room", etc.).
