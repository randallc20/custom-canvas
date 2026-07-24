# Custom Canvas — Go-Live Plan

*Written 2026-07-24. The company plan: from staging to a real, growing
marketplace. LAUNCH.md remains the detailed infra checklist (Phase L1's
appendix); this document is the ordered path and the scale roadmap.*

**Operating principle: launch on the current stack, scale by tier.** The
architecture (Next.js + Supabase + Stripe Connect) comfortably serves the
first ~10k users with the Phase L2 hardening below. We do NOT build
big-company infrastructure before having users — each scale tier has a
trigger metric that tells us when to build the next layer.

---

## Phase L0 — Business foundations (Chris + Phil; ~1–2 weeks, mostly waiting)

Nothing here is code, and everything here blocks live money.

- [ ] **Entity + banking**: LLC finalized, EIN, business bank account.
- [ ] **Stripe live activation**: business details + bank; enable Connect
      (Express) and Stripe Tax in live mode. Add the **Texas sales tax
      registration** (platform is merchant of record). Statement descriptor:
      `CUSTOMCANVAS`.
- [ ] **Legal review of Terms + Privacy** (currently homemade): marketplace
      liability, artist-mediated refund policy, Connect artist agreement,
      Texas marketplace-facilitator tax language. A few hours of a startup
      lawyer's time now saves real pain later.
- [ ] **Domain + email**: getcustomcanvas.com DNS access; hello@ mailbox
      (Google Workspace or similar) for support + Resend replies.
- [ ] **Insurance** (optional now, revisit at revenue): general liability /
      media.

## Phase L1 — Production infrastructure (me, once L0 credentials exist; ~1 day)

Everything from LAUNCH.md §1–§7, executed in order, plus these additions:

- [ ] **Supabase Pro** ($25/mo) for the prod project: daily backups, no
      auto-pause, higher limits. Enable **PITR add-on** once real orders
      exist (point-in-time recovery is cheap insurance for a money DB).
- [ ] **Custom SMTP for Supabase Auth** ⚠️ commonly missed: default auth
      email is limited to ~2/hour — signups would break immediately. Point
      Supabase Auth SMTP at Resend with the verified domain.
- [ ] **Re-enable email confirmation** on signup (disabled on staging).
- [ ] **Environments**: prod = getcustomcanvas.com on prod Supabase/Stripe
      live; staging keeps DEV Supabase + Stripe test as the permanent test
      bed. Vercel env vars split accordingly.
- [ ] **Rotate every secret that passed through development chat** (DB
      password, Vercel token, all API keys) — prod gets fresh secrets that
      have never left the dashboards.
- [ ] **Stripe dashboard branding** upload (brushstroke assets in
      brand/stripe-branding/).

## Phase L2 — Scale + safety hardening (me; ~2–3 days of build, before public launch)

- [ ] **Upstash Redis rate limiting** — replace per-instance memory limits
      with real global limits (the current ones reset on every serverless
      cold start). Free tier covers launch volume.
- [ ] **Playwright critical-path CI** — activate the skipped suite against
      a seeded staging account so every deploy is gated on: signup →
      onboard, create listing, purchase, commission flow, message. This is
      the single highest-value guard once real users exist.
- [ ] **Uptime + alerting**: external uptime monitor on / and
      /api/webhooks/stripe (BetterStack free tier), Sentry alert rules →
      email, Vercel Analytics + Speed Insights on.
- [ ] **Ops dashboard v0**: extend /admin with the company metrics that
      matter — GMV, take (platform revenue), orders, active listings,
      signups by role, by city. (The admin API already computes most of it.)
- [ ] **Load sanity check**: script a 100-concurrent-browse burst against
      staging; confirm feed p95 and no 429s from normal browsing.
- [ ] **runbook.md**: what to do when — webhook failures, refund disputes,
      Supabase incident, key compromise. One page.

## Phase L3 — Supply, then launch (Chris-led with my support; the real work)

A marketplace launch is a supply launch. Buyers bounce off an empty city.

- [ ] **Seed Houston properly before announcing**: target 15–25 real
      artists live with 3+ listings each. Recruit through the partner
      orgs (gallery + school relationships are built for exactly this).
      White-glove onboarding: we can batch-create accounts + walk artists
      through their first listing.
- [ ] **Curate**: Featured shelf full (10), partner picks live, every
      artist Local Verified. First impressions are the homepage.
- [ ] **Production smoke test** (LAUNCH.md §8, updated): full TESTING.md §1
      + §3 pass on prod including ONE REAL purchase with a real card and a
      real artist payout landing in a bank account, then an artist-mediated
      refund settled end-to-end.
- [ ] **Soft launch (1–2 weeks)**: invite-only — artists' own audiences +
      friends. Watch Sentry, orders, and feedback. Fix fast.
- [ ] **Public launch**: announce Houston. Local press angle ("85% to
      artists, Houston-first") + artists announcing to their own followings
      is the whole initial channel.

## Phase L4 — Scale roadmap (build WHEN the trigger fires, not before)

### Tier 1 → ~1,000 users (current stack, no changes)
Trigger to advance: sustained growth + first artists with 500+ followers.
- Watch: Supabase compute (upgrade sizes are one click), Vercel usage,
  Resend volume.

### Tier 2 → ~10,000 users
- **Email fan-out to a queue** (Inngest or Upstash QStash): the 500-recipient
  cap and in-request sending stop being acceptable. Also move drip crons in.
- **analytics_events rollups**: nightly aggregate tables; the raw table
  stops being queried directly (it's the fastest-growing table).
- **Image pipeline**: audit Next/Image + Supabase transform costs; add
  explicit sizes/quality budgets.
- **Search**: revisit — pg full-text holds fine at this size; add pg_trgm
  typo tolerance (the deferred option C).
- **Support tooling**: shared inbox, canned responses, SLA on disputes.

### Tier 3 → ~100,000 users
- **The For You page** (the North Star): personalized feed from
  follows/saves/views — needs the event rollups from Tier 2 as input.
  This is a product milestone as much as infra.
- **Dedicated search** (Typesense/Meilisearch) if query volume/relevance
  demands it.
- **Postgres scaling**: Supabase compute upgrade → read replica for
  feed/search reads; connection review.
- **Trust & safety at scale**: Stripe Radar rules, content moderation
  queue staffing, artist verification workflows per city.
- **Multi-city playbook**: the Houston seeding motion, productized —
  city-by-city supply recruitment is the growth engine, not ads.

## Costs at launch (monthly)

| Item | Cost |
|---|---|
| Supabase Pro (prod) | $25 |
| Vercel Pro | $20 |
| Resend (10k emails) | $20 |
| Upstash, Sentry, BetterStack | free tiers |
| Domain + Workspace | ~$20 |
| **Total** | **~$85/mo** + Stripe's per-transaction cut |

Revenue covers infra at roughly $425/mo GMV (15% + fees). Everything scales
with usage, nothing is a big fixed commitment.

## Success metrics (define now, watch weekly)

- **North star: GMV** (art sold through the platform).
- Supply health: live artists, listings per artist, % Local Verified.
- Demand health: signups, follows per buyer, save→purchase rate.
- Local density: per-city artists + orders (the metric that gates opening
  city #2 — don't spread thin; win Houston first).

## Sequencing summary

```
Week 1     L0 (banking/Stripe/legal/domain — mostly Chris+Phil waiting on providers)
           L2 build runs in parallel (me, needs no credentials)
Week 2     L1 prod infra (1 day once L0 lands) → prod smoke test
Weeks 2–4  L3 supply seeding (the long pole — artist recruitment)
Then       Soft launch → public Houston launch
```

The honest critical path is **Stripe live activation** (needs the LLC + bank)
and **artist recruitment** — everything technical fits inside their shadow.
