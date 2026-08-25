# Custom Canvas — Operations Runbook

*One page. What to do when something breaks. Keep it blunt and current.*

Prod: **customcanvas.shop** (Vercel project `custom-canvas-prod`, prod Supabase
`nxdbmaslsfaestusrapp`, Stripe). Staging: **custom-canvas-chi.vercel.app**
(project `custom-canvas`, DEV Supabase, Stripe test). Deploys are push-to-master
auto-deploys per project.

---

## Stripe webhook failures
**Symptom:** buyer paid but no order / no payout / no confirmation email; Stripe
Dashboard → Developers → Webhooks shows failed deliveries to
`/api/webhooks/stripe`.
1. Read the failing event in Stripe → Webhooks → the endpoint → click the event
   → **Resend**. Replaying is safe: order creation dedupes on the payment-
   intent id (pre-check + unique index — there is NO event-id table, so don't
   look for one), refund handling is guarded by order status, and the other
   handlers are harmless re-runs.
2. If many are failing: confirm `STRIPE_WEBHOOK_SECRET` in Vercel prod matches
   the live endpoint's signing secret (a key rotation or a new endpoint changes
   it). Mismatch → every event 400s on signature check.
3. Check Sentry for the handler stack trace. Common cause: a DB write failing
   (RLS / missing column after a migration that didn't reach prod).
4. Backfill: once fixed, resend the affected events from Stripe.

### Settle-refund retry edges (rare, know them)
- Retrying a failed settle with a DIFFERENT reason within 24h → Stripe
  idempotency params-mismatch error (repeated 502). Retry with the same
  reason (the admin UI always sends the same one) or wait out the 24h key.
- A settle that crashed mid-flight and is first retried MORE than 24h later
  can mint a fresh refund attempt that exceeds the remaining refundable
  balance → recurring 502. Fix by backfilling orders.stripe_refund_id with
  the refund id visible in Stripe, then retry (it will skip to the reversal).

## Chargebacks (card disputes)
`charge.dispute.created` marks the order `disputed`, notifies the artist AND
every admin to send shipping/delivery evidence, and raises a Sentry error —
**the bank sets the response deadline, so act the day it lands.** Respond in
Stripe Dashboard → Payments → Disputes. On `charge.dispute.closed`: `lost`
reverses the artist payout exactly (idempotency-keyed, id persisted) and marks
the order `refunded`; `won` restores it to delivered/paid. The piece is NOT
auto-relisted after a chargeback — its whereabouts is unclear, so relist it by
hand if the artist still has it.

## Refund / dispute
- **Refund** is artist-mediated: buyer requests in chat → artist "Approve refund"
  in Studio → admin "Settle refund" in `/admin`. Buyer gets price+shipping; the
  service fee is never refunded; artist payout is reversed via explicit transfer
  reversal. If "Settle" errors, check the order's `payment_intent` still has an
  un-reversed transfer in Stripe.
- **Chargeback/dispute** (Stripe Dashboard → Payments → Disputes): gather the
  order + shipping evidence, submit in Stripe. Platform is merchant of record.

## Payments suddenly not working
- Check `NEXT_PUBLIC_PAYMENTS_ENABLED` in Vercel prod (`true` to sell). If a
  buyer sees checkout disabled, this flag is `false`.
- Verify prod Stripe keys are **live** (`pk_live`/`sk_live`), not test.

## Supabase incident (DB down / slow / RLS lockout)
1. status.supabase.com for platform incidents.
2. Supabase Dashboard → the prod project → Logs (Postgres / API / Auth).
3. Restore: prod is on **Pro** (daily backups). For a bad migration or data
   loss, restore from backup / **PITR** (enable PITR add-on once real orders
   exist). Never run an unreviewed migration against prod — test on staging.
4. Connection exhaustion under load → use the **session pooler** host and/or
   bump compute size (one click).

## Auth emails not arriving (signups broken)
- Supabase's built-in auth email caps at ~2/hour. Prod **must** use custom SMTP
  → Resend (Supabase → Auth → SMTP). If signups stall, this is the first suspect.
- Transactional email (orders, messages) goes through Resend directly with
  `EMAIL_FROM=noreply@customcanvas.shop`; check the Resend dashboard for bounces
  / domain verification status.

## Rate limiting (429s / abuse)
- Limits live in `src/middleware.ts` (`LIMITS` map, per-route/min).
- Global limiting is **Upstash**; active only when `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` are set in prod. Without them it falls back to a
  best-effort **per-instance** in-memory limiter (does not enforce a true global
  cap). If Redis is unreachable the middleware fails open (never blocks real
  traffic on limiter infra) and degrades to the in-memory floor.
- Legit users hitting 429s → raise the relevant entry in `LIMITS` and redeploy.

## Key compromise / rotation
Rotate the leaked secret at its source, then update Vercel prod env + redeploy:
- Supabase keys → Supabase → Settings → API (roll anon/service).
- Stripe → roll `sk_live` in Stripe → update Vercel + the webhook secret.
- Resend / Upstash / Sentry → roll in their dashboards.
- DB password → Supabase → Database → reset; update `SUPABASE_DB_PASSWORD`.
Any secret that ever sat in `.env.local` or chat is considered exposed.

## Bad deploy / rollback
Vercel → project → Deployments → the last-good deployment → **Promote to
Production** (instant rollback, no rebuild). Then fix forward on a branch.

---

## Owner-action checklist (dashboard toggles this repo can't do in code)
- [ ] **Upstash**: create a free Redis DB — pick the region colocated with
      the Vercel functions (US East / iad1); every API request pays one Redis
      round-trip, so cross-region doubles API latency. Add
      `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` to Vercel prod →
      global rate limiting goes live.
- [ ] **Vercel Analytics + Speed Insights**: enable both in the project's
      Analytics tab (code is already wired in `layout.tsx`).
- [ ] **Uptime monitor**: BetterStack (free) → HTTP monitors on
      `https://customcanvas.shop/` and `/api/webhooks/stripe` → alert to email.
- [ ] **Sentry alert rules**: route new-issue + spike alerts to email.
- [ ] **E2E in CI**: add repo secrets `E2E_BUYER_EMAIL/PASSWORD`,
      `E2E_ARTIST_EMAIL/PASSWORD` (seeded staging accounts) so the `e2e` job
      exercises the authenticated critical paths on every master push.
