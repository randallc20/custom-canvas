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
- Security migrations live on BOTH databases: profiles/artist_profiles
  column privacy, listing-visibility RLS + child-table follow-through,
  approval gate, artist-agreement columns, and the 2026-08-25 review
  remediation — order-forgery/status-guard/blocking/review-attribution
  (00030–00038).

## 1. Stripe (live mode) — after LLC + bank ✅ (bank exists as of 2026-08-18)
- [ ] Activate the Stripe account (LLC details + bank for payouts).
- [ ] Enable **Stripe Connect** (Express) in live mode.
- [ ] Enable **Stripe Tax**: set origin address, add the **Texas** registration
      (and any other states once nexus is established). The platform is the
      merchant of record — tax stays with the platform via `transfer_data.amount`;
      refunds return the buyer's tax on price+shipping (00035 flow).
- [ ] Copy live `pk_live_…` / `sk_live_…` into Vercel prod env
      (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
- [ ] Register the live webhook → `https://customcanvas.shop/api/webhooks/stripe`
      events: `checkout.session.completed`, `account.updated`,
      `charge.refunded`, `payment_intent.payment_failed`,
      **`charge.dispute.created`**, **`charge.dispute.closed`**. Copy `whsec_…` →
      `STRIPE_WEBHOOK_SECRET` in Vercel prod. (The two dispute events are what
      notify the artist to send shipping evidence and claw the payout back on a
      lost chargeback — without them the Artist Agreement §4 promise has no
      implementation and the platform silently eats every lost dispute.)
- [ ] Stripe Dashboard → Branding: upload `brand/stripe-branding/` assets.
- [ ] Flip `NEXT_PUBLIC_PAYMENTS_ENABLED=true` in Vercel prod + redeploy.

## 2. Auth email (before real signups)
- [ ] Supabase prod → Auth → SMTP: point at Resend with the verified domain
      (the default auth mailer caps at ~2/hour — signups break without this).
- [ ] Re-enable email confirmation on signup.

## 3. Hardening activations (runbook has details)
- [ ] Upstash Redis (US East/iad1) → `UPSTASH_REDIS_REST_URL`/`_TOKEN` in
      Vercel prod (activates global rate limiting).
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
