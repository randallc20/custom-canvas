# Custom Canvas — Launch Checklist

Everything needed to take the staging build to production. Work top to bottom.

## 0. Staging catch-up (Build 3)
- [ ] Apply migrations 00024–00026 to the **DEV** project (same psql loop as §1,
      IPv4 session pooler host):
  ```bash
  for f in supabase/migrations/00024_featured_listings.sql \
           supabase/migrations/00025_publish_notifications.sql \
           supabase/migrations/00026_partner_picks.sql; do
    psql "$DEV_DB_URL" -f "$f"; done
  ```
- [ ] Verify on staging: homepage shelves render, `/admin/featured` curation works,
      partner picks manager + shelves work, and one publish-email fan-out arrives.

## 1. Production Supabase project
- [ ] Create `custom-canvas-prod` (separate from `custom-canvas-staging`).
- [ ] Apply all migrations in order:
  ```bash
  for f in supabase/migrations/000*.sql; do psql "$PROD_DB_URL" -f "$f"; done
  ```
  (Use the IPv4 **session pooler** host if your network is IPv6-only:
  `postgres.<ref>@aws-1-<region>.pooler.supabase.com:5432`.)
- [ ] Run `supabase/seed.sql` (tags).
- [ ] Confirm 6 storage buckets exist with the size/MIME limits from migration 00012
      (avatars 2MB, banners/listings/photos 5MB, videos 200MB, chat 10MB).
- [ ] Enable Realtime on `messages`, `notifications`.
- [ ] Copy the prod URL + anon (`sb_publishable_…`) + secret (`sb_secret_…`) keys.

## 2. Stripe (live mode) — after Phil's LLC + bank
- [ ] Activate the Stripe account (LLC details + bank for payouts).
- [ ] Enable **Stripe Connect** (Express) in live mode.
- [ ] Enable **Stripe Tax**: set origin address, add the **Texas** registration
      (and any other states once nexus is established). The platform is the
      merchant of record — tax stays with the platform via `transfer_data.amount`.
- [ ] Copy live `pk_live_…` / `sk_live_…`.
- [ ] Register the live webhook → `https://getcustomcanvas.com/api/webhooks/stripe`
      events: `checkout.session.completed`, `account.updated`,
      `charge.refunded`, `payment_intent.payment_failed`. Copy `whsec_…`.

## 3. Resend (production sending)
- [ ] Verify the sending domain (DNS: SPF, DKIM) for `getcustomcanvas.com`.
- [ ] Set `EMAIL_FROM="Custom Canvas <noreply@getcustomcanvas.com>"`.
- [ ] Create a prod API key.

## 4. Sentry
- [ ] Create/confirm the prod project; set `NEXT_PUBLIC_SENTRY_DSN`.
- [ ] Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source maps.

## 5. Vercel (production)
- [ ] Point the project's Production environment at the prod values for every var:
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SENTRY_DSN`, `CRON_SECRET`,
      `NEXT_PUBLIC_APP_URL=https://getcustomcanvas.com`.
- [ ] (Optional, recommended) `UPSTASH_REDIS_REST_URL` / `_TOKEN` and switch the
      rate-limit middleware from in-memory to Upstash for global limits.
- [ ] Confirm the 4 cron jobs are scheduled (vercel.json: commission-nudges,
      review-reminders, away-mode, onboarding-drips).

## 6. Domain
- [ ] Add `getcustomcanvas.com` in Vercel; set DNS (A/CNAME) at the registrar.
- [ ] Verify HTTPS + the apex/www redirect.

## 7. Security rotation (IMPORTANT)
- [ ] Rotate **every** key that was shared during development (Supabase keys,
      Stripe test keys, Resend key, Vercel token) — generate fresh prod secrets.

## 8. Smoke test on production
- [ ] Register a buyer + an artist; artist completes profile (goes live).
- [ ] Artist creates a listing with an image.
- [ ] Buyer purchases with a real card (small amount) → order created, artist
      payout shows in Stripe, tax collected, both emails arrive.
- [ ] Fee model verified: 5% service fee (capped at $15) shows on the listing
      page, checkout breakdown, order record, and both confirmation emails.
- [ ] Buyer cancels a fresh order → full refund lands.
- [ ] Commission request → quote (in-thread) → accept → progress update → notify.
- [ ] `npx playwright test` (set `E2E_BASE_URL`) — smoke specs green.

## Known follow-ups (post-launch, non-blocking)
- Wire listing-image upload into the create-listing form (ImageUpload exists; the
  form still shows a placeholder).
- Email fan-out for follower/price-drop alerts shipped in Build 3; future item is
  a deliverability upgrade (move batch sends to a queue).
- Move rate limiting to Upstash; expand Playwright critical-path coverage.
- Cover the backlog in `docs/UPDATE_PLAN.md` (collections, "view in a room", etc.).
