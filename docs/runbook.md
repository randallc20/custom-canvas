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
   handlers are harmless re-runs. **One exception:** do not resend a
   `charge.dispute.created` / `charge.dispute.updated` once that dispute has
   closed — an open event's payload never changes, so it still says
   `needs_response`. The handler recognises the dispute by its id and
   recorded outcome and ignores it, but a row that never saw the close has
   no outcome to recognise; if the order is wrong after a dispute, resend
   the `charge.dispute.closed` event instead.
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

### Fulfilment-window cron (`/api/cron/fulfillment-windows`, 13:00 UTC)

The only automated money movement in the product, so know exactly what it
does (L7, Shipping "If your piece is never shipped"):

- **Day 5+ unshipped, nothing proposed** → asks the artist to ship or offer a
  date, tells the buyer where they stand, posts a note in the thread, and
  stamps `platform_nudged_at`. Nothing is cancelled.
- **5 business days after that nudge**, still unshipped, no proposed date, and
  no artist message in the buyer↔artist thread since → **cancels and refunds
  in full** (reason `not_shipped`, initiated_by `platform`), reverses the
  payout, relists the piece, and notifies every admin.

"Unreachable" is no artist message in the thread since the nudge — the same
read seller-protection requirement 6 uses, so an artist who answered the buyer
is never treated as silent. Every read failure resolves in the LENIENT
direction (treated as "the artist spoke"), because the cost of being wrong is
cancelling a live sale.

Capped at 25 cancellations per run. If you see
`hit the 25-cancel cap in one run` in Sentry, something is wrong with the
selection — check before letting it run again.

A buyer can always cancel a past-window unshipped order themselves; that path
does not wait for the cron and does not ask the artist.

### Stripe reconcile cron (the safety net)
`/api/cron/stripe-reconcile` runs daily at 14:00 UTC (`vercel.json`). It diffs
Stripe's view of a set of payments against `orders` — read-only, it never
writes to `orders` or `listings`. The set is the union of:
- every succeeded payment **created** in the last 7 days (the only ones that
  get the "payment with no row" check — an old payment with no row is not a
  new fact);
- the payment behind every Stripe **refund** created in the last 7 days;
- the payment behind every Stripe **dispute** created in the last 7 days;
- every `orders` row currently `disputed`, whatever its age (chargebacks are
  decided two to three months after payment, so a dropped
  `charge.dispute.closed` is only ever visible this way).

So a dashboard refund on a 3-week-old order, a chargeback on a 2-month-old
one, or a dispute won/lost while the webhook was failing all surface the next
day. Not covered: a refund or dispute created more than 7 days ago on an order
that is NOT `disputed` and whose webhook was dropped that long ago — run it
with a hand-edited window if an outage lasted longer than a week.
A payment with no row, a Stripe refund or dispute the row does not reflect,
or a row marked `refunded` that Stripe never refunded, produces ONE admin
notification ("Stripe reconcile found mismatches", every admin) and a Sentry
error listing each payment intent id with the reason. Nothing wrong → no
alert.
When it fires:
1. Open the Sentry event; each line is `kind pi_… order=…: detail`.
2. In Stripe → Payments, open each `pi_…` and read its refund / dispute state.
3. Fix the row by replaying the missed webhook event (step 1 above) — resend
   `checkout.session.completed` for a missing order, `charge.refunded` or
   `charge.dispute.*` for a status disagreement. Only hand-edit `orders` when
   there is no event to replay (e.g. a row marked refunded with no Stripe
   refund: issue the refund from the dashboard, or correct the row).
4. It re-runs tomorrow; a clean run confirms the fix. To run it now:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/stripe-reconcile`.

## Chargebacks (card disputes)
`charge.dispute.created` marks the order `disputed`, notifies the artist AND
every admin to send shipping/delivery evidence, and raises a Sentry error —
**the bank sets the response deadline, so act the day it lands.** Respond in
Stripe Dashboard → Payments → Disputes. On `charge.dispute.closed`: `lost`
reverses the artist payout exactly (idempotency-keyed, id persisted) and marks
the order `refunded`; `won` restores it to delivered/paid. The piece is NOT
auto-relisted after a chargeback — its whereabouts is unclear, so relist it by
hand if the artist still has it.
- **Signature confirmation on a $750+ order — do this FIRST, before you
  respond.** Seller-protection requirement 4 is the platform's to record, not
  the artist's (ruling D7). The protection verdict is frozen the instant the
  dispute webhook lands, which is long before anyone could check a carrier.
  The admin dispute notification says so when it applies. Steps:
  1. Open the carrier's tracking page for the order's tracking number.
  2. Look for an actual **signature event** — a name, or "signed for by". A
     plain "delivered" scan is NOT signature confirmation.
  3. If one exists, click **Record signature confirmation** on `/admin/orders`.
     That writes the evidence and re-assesses the order, which can move it
     from Not protected to Protected — meaning Custom Canvas absorbs the loss
     instead of reversing the artist's payout.
  4. Only then respond in Stripe, and include the signature record.

  Never record it without seeing the carrier's record. It is seller-protection
  evidence and the route refuses to write it twice.
- **Inquiries** (`warning_*` statuses — Discover, Amex, Visa pre-disputes)
  arrive through the same event, move no funds and freeze nothing; admins are
  asked to respond in Stripe. If the inquiry is answered with a refund and the
  issuer escalates anyway, the escalation lands as "Inquiry escalated on a
  refunded payment": respond in Stripe with the refund as evidence before the
  deadline or it is lost by default and the buyer keeps both. The reconcile
  cron also reports it (`dispute_escalated_on_refunded_order`).
- **A second dispute on the same payment** (rare; Stripe allows it) runs the
  lost branch again and reverses only what is left of the payout after the
  first reversal. The row holds one dispute id — the latest — plus
  `dispute_status`, the last Stripe status recorded for it.

## Refund / dispute
- **Refund** is artist-mediated: buyer requests in chat → artist "Approve refund"
  in Studio → admin "Settle refund" in `/admin`. Buyer gets price+shipping; the
  service fee is never refunded; artist payout is reversed via explicit transfer
  reversal. If "Settle" errors, check the order's `payment_intent` still has an
  un-reversed transfer in Stripe.
- **Chargeback/dispute** (Stripe Dashboard → Payments → Disputes): gather the
  order + shipping evidence, submit in Stripe. Platform is merchant of record.

## DMCA notices (`/admin/dmca`)

⚠️ **Before this page is honest, two things must exist and both are Chris's:**
the designated agent registered in the U.S. Copyright Office DMCA Designated
Agent Directory (the $6 filing — safe harbour under §512 depends on the
registration, not on the page), and the dedicated mailbox
(`dmca@customcanvas.shop` on the domain's real mail host; Resend sends but does
not receive). Until counsel's filled agent details land in
`docs/legal/website legal documents/markdown/dmca-policy.md`, `/dmca` replaces
the agent block with an interim notice pointing at support@ — that swap keys
on the placeholders themselves, so the real block publishes the moment the
text arrives, with no deploy.

**Intake → removal → restoration:**

1. **Log it** on `/admin/dmca` with the claimant's name and email, the listing
   id, and notes on which of the six required elements are present. The policy
   says an incomplete notice "may not trigger our obligations" and that we may
   request clarification — if elements are missing, ask, and mark it
   **Defective** if it stays that way.
2. **Remove material** hides the listing and stamps `dmca_removed_at`, which
   the 00065 guard uses to stop the artist republishing it from Studio. Only
   the restore path clears it.
3. **Notify the user.** The policy commits to taking reasonable steps to tell
   them and to give them a copy or summary of the notice **including the
   claimant's contact information**. Do this by email; keep it factual.
   Removal is not a finding of infringement — say so.
4. **Counter-notice**: mark it received, and **forward it to the original
   claimant** (the policy tells the user it may be forwarded, so this is
   expected, not a courtesy).
5. **Restore** no sooner than **10** and no later than **14 business days**
   after the counter-notice, UNLESS the designated agent has received notice
   of a qualifying court action. The route refuses before 10 business days and
   flags a restore past 14 — if you see that flag, the window was missed and
   it is worth knowing why. You may also decline restoration where the
   material independently breaches the Terms of Service, the Listing Standards
   or the law.

**Repeat infringers.** The page shows a per-user count from
`dmca_substantiated_count()`, which is the policy's definition in SQL:
substantiated notices in the trailing 12 months, EXCLUDING withdrawn,
defective, and restored-after-counter-notice. **Three or more ordinarily means
termination** — but the policy is explicit that this is guidance and that the
assessment is on the total circumstances, so the badge is a prompt to decide,
not a trigger. Immediate termination is available regardless of count for
deliberate or large-scale infringement (wholesale copying of an artist's
catalogue), and lesser measures — removing material, restricting listing
privileges, a warning, a suspension pending review — are all on the table.

## Retention (`/api/cron/retention`, Sundays 11:00 UTC)

Privacy §6 states retention periods; this keeps them (L10). A retention
promise nobody keeps is worse than no promise.

- **Analytics events**: deleted past 24 months.
- **Message threads**: deleted 3 years after the last message — UNLESS the two
  participants have an order, or the thread has a commission, younger than 7
  years. Order records are kept 7 years for tax and dispute defence, and the
  buyer↔artist thread IS that dispute evidence (it is what seller-protection
  requirement 6 is judged from). The two promises are in tension and the
  longer one wins. Every read failure in that check SKIPS the delete, because
  the failure mode is destroying evidence.
- Private `chat-attachments` objects are removed BEFORE the thread row, so a
  storage failure leaves the thread in place for the next run rather than
  orphaning files nobody can reach.
- 500 rows per table per run. A large first run spreads over a few weeks.
- Logs an info-level Sentry message every run with the counts: a job that runs
  and deletes nothing looks identical to one that is not running, and the
  difference matters when someone asks whether we keep our own policy.

**Not automated, and both are settings rather than code:**
- **Error logs, 90 days** — Sentry project retention. ⚠️ Confirm this in the
  Sentry project settings; the policy states it as fact.
- **Backups, rolling 90 days** — Supabase Pro takes 7-day PITR backups, which
  is inside the 90-day promise. Nothing to change.
- **Listings and images, 90 days after account closure** — account deletion
  already removes listings; there is no separate 90-day sweep because there is
  nothing left to sweep.

## Privacy rights requests (Privacy §7)

Requests arrive at support@customcanvas.shop. Texas (TDPSA) shapes the clock:

1. **Verify the requester** owns the account — reply from the address on the
   account, or ask them to sign in and send from the account's email.
2. **Answer within 45 days.** One 45-day extension is allowed if you tell them
   why, in writing, inside the first 45.
3. **What each right means here:**
   - *Access* — profile, listings, saved items, message threads, order
     records. Export from the admin console or straight from Supabase.
   - *Correct* — the account page covers most of it; do the rest by hand.
   - *Delete* — `/api/account/delete` (the person can run it themselves).
     It detaches them from completed sales and KEEPS the money record: order
     amount, date, tax collected, and the shipping address the piece went to,
     for seven years. §6's "How deletion interacts with records we must keep"
     is the paragraph to quote back if they ask why.
   - *Port* — the access export, as JSON.
4. **If you turn a request down**, say so within the 45 days with the reason.
   The requester may appeal; you have **60 days** to answer an appeal, and if
   you deny the appeal you must give them a way to complain to the **Texas
   Attorney General**.
5. **Global Privacy Control**: no action needed. We do not sell personal data
   and do not share it for cross-context behavioural advertising, so there is
   nothing for a GPC signal to switch off. Do not add a "Do Not Sell" link
   that implies otherwise.

## Data breach (Privacy §8)

1. **Contain first**, then determine scope: whose data, which fields, when.
2. **Notify affected individuals without unreasonable delay** once you have
   determined a breach occurred — Texas requires it within **60 days**.
3. **250 or more Texans affected**: notify the **Texas Attorney General**
   within **30 days**, electronically, including the categories of data, the
   number of people, and what you did about it.
4. Notify Supabase/Stripe/Vercel if the breach involves their systems, and
   keep a written timeline from the first hour — reconstructing one later is
   how deadlines get missed.

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
