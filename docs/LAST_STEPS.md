# Last Steps — pick up here (written 2026-07-03)

Everything Build 3 left for a human with credentials, in the order to do it.
Code is done and pushed (`9b98388`…`18c0ff2`); staging auto-deployed. The
testing document (by-role walkthrough) is the step after this list.

---

## 1. Apply the three Build 3 migrations to DEV — ✅ DONE 2026-07-06

The build environment had no DB password, so these are written but not run.
Until they run: homepage Featured + Partner-picks shelves stay hidden, the
`/admin/featured` and partner "Your Picks" managers can't save, and the
new-listing / price-drop **emails silently skip** (claims fail soft).

```bash
cd ~/Projects/custom-canvas
export PSQL=/opt/homebrew/opt/libpq/bin/psql   # psql isn't on PATH
export DB_URL="postgresql://postgres.nlatruygmarojthfjzog:<DB_PASSWORD>@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
for f in supabase/migrations/00024*.sql supabase/migrations/00025*.sql supabase/migrations/00026*.sql; do
  $PSQL "$DB_URL" -f "$f"
done
```

Notes:
- 00025 was rewritten during final review — 00022 already added
  `followers_notified_at`, so 00025 now only adds the two email-claim stamp
  columns + a guard trigger. It disables/re-enables `listings_updated_at`
  around its backfill; that's intentional.
- These files are also matched by LAUNCH.md §1's glob for prod later.

## 2. Ten-minute staging verification — ✅ DONE 2026-07-06 (all five items verified live: featured shelf, partner picks + note, publish + price-drop stamps/notifications, full Stripe test purchase with conserved money; found + fixed a never-wired new_order in-app notification)

- [x] **Featured shelf**: log in as admin (`chris.f.randall@gmail.com`) →
      Admin → Featured → add ~4 pieces → homepage shows "Featured in Houston".
- [x] **Partner picks**: `bayou-city-gallery@cc-demo.com` / `DemoPass123!` →
      Partner Dashboard → Your Picks → pick 3+ with a note → shelf appears on
      their gallery page and (as the only eligible partner) on the homepage.
- [x] **Publish email**: as `artist.test@customcanvas.dev`, create + publish a
      listing → `buyer.test@customcanvas.dev` (follows Ada) gets the email
      once. Re-publishing must NOT re-send.
- [x] **Price-drop email**: lower a price on a listing buyer.test saved →
      one email; a second drop within 24h → no email.
- [x] **Full purchase on staging** (webhook is configured there): buy a piece
      as buyer.test with Stripe test card `4242 4242 4242 4242` → order
      appears in /orders and /studio/sales, listing marked sold, both
      confirmation emails show the tax-inclusive total and the processing-fee service fee (~3% + 31¢, grossed up).

## 3. Stripe housekeeping (test mode)

- Ada Artist was pointed at connected account `acct_1ThdjuGrRmIRxjUM`
  (charges-enabled) on 2026-07-03 so checkout is testable; her original
  `acct_1TkX5iGhXaK8fCjD` never finished test-mode KYC. Either finish that
  onboarding or keep the reassignment — just know it happened.
- Optional, for full purchases on localhost: `brew install stripe/stripe-cli/stripe`
  then `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  (and put the printed `whsec_…` in `.env.local` STRIPE_WEBHOOK_SECRET while
  it runs). Otherwise local testing stops at the Stripe payment page and
  order-creation assertions live in the staging section of the test doc.

## 4. One business decision parked for you + Phil — ✅ DECIDED & BUILT 2026-07-06 (artist-mediated refunds: request via chat → artist approves → admin notified → settle returns price+shipping, fee kept, exact payout reversal; verified end-to-end in Stripe test mode)

**Partial-refund transfer policy.** Stripe's `reverse_transfer: true` on a
partial refund claws back from the artist *proportionally to the whole
charge* (including fee + tax). Example: refunding just the $15 buyer fee on a
$362.64 charge pulls ~$11 from the artist's payout even though artist
economics shouldn't change. Options: (a) accept proportional (current),
(b) partial refunds without transfer reversal (platform eats them),
(c) compute the reversal amount explicitly per case. Decide before real
disputes exist; code change is small once decided.

## 5. Then: the testing document

Structure agreed: by role — Buyer / Artist / Partner / Admin — plus a setup
section (accounts table, migrations prerequisite, local-vs-staging webhook
caveat). All test accounts and expected states are in the memory/staging
notes; every flow above has been smoke-tested except the two marked staging-only.

## 6. Known deferred items (post-launch, already documented)

- Email deliverability: move fan-out to a queue at scale (cap is 500/event).
- Upstash Redis rate limiting (per-instance memory today).
- Activate the skipped Playwright critical-path CI suite (needs seeded CI env).
- Buyer identity / collector profiles — first seed of the social layer →
  evolves toward the **For You page** (personalized feed off follows/saves).
- Analytics depth beyond the 7-day strip + 30-day trends (per-listing
  time-series, longer ranges).
- LAUNCH.md proper (prod Supabase/Stripe/DNS/key rotation) — unchanged scope.
