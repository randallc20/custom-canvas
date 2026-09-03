# Note for counsel — four text corrections to the final document set

*Prepared 2026-09-03, on implementing the product changes for the
counsel-reviewed set (v2.0 ToS / Terms of Sale / Artist Agreement / Privacy,
v1.0 Seller Protection / Listing Standards / Shipping / DMCA, all effective
2026-09-03).*

Chris — this is the whole of what needs to go back. Everything else in the set
is either already true of the product or is being built to match it; these four
are places where the documents describe a product that is not the one we have,
plus the DMCA placeholders. Forward as-is if that's easiest.

---

## A1 — Local pickup protection: the feature exists

**Where.** Artist Agreement §4, the paragraph beginning "Local pickup is not
currently eligible for protection"; and Seller Protection Policy, "Local pickup
is not eligible today."

**What the documents say.** That the pickup-confirmation feature "is not yet
built" and that pickup orders "currently evaluate as unprotected."

**What is true.** The two-sided pickup handoff exists, is tested and works.
Buyer and artist each confirm the handoff from their own order card; on the
second confirmation the order becomes delivered and protection attaches. There
is an end-to-end test (`e2e/pickup-handoff.spec.ts`) that asserts exactly that.

**Suggested replacement for both passages.** "Pickup orders are Protected when
both parties confirm the handoff through the Platform's pickup-confirmation
process. An order confirmed by only one party is not delivered and is not
Protected."

## A2 — Local pickup: drop the "until that feature is available" hedges

**Where.** Terms of Sale §3 "Local pickup"; Shipping, Returns & Refunds,
"Local pickup".

**What the documents say.** "use any pickup-confirmation process provided by
the Platform"; "or, until that feature is available, a clear written
confirmation in Messages."

**What is true.** The process is provided.

**Suggested fix.** Drop the hedges. The written-confirmation fallback can stay
as practical advice, just not as a substitute for a feature that exists.

## A3 — Privacy Policy §3: a processor is missing from the table

**Where.** Privacy Policy §3, the processor table. It lists Supabase, Stripe,
Resend, Vercel, Sentry, Turnstile, BigDataCloud and zippopotam.us.

**What is true.** The rate limiter also sends the requester's IP address to
**Upstash** (Redis) whenever `UPSTASH_REDIS_REST_URL` is configured, which it
is in production.

**Suggested fix.** Add a row:

| Processor | Purpose | Data |
|---|---|---|
| Upstash | Rate limiting | IP address and request path |

**Operational note for Chris:** A3 is only an accurate disclosure if Upstash is
actually configured in production. Confirm `UPSTASH_REDIS_REST_URL` is set
there — it is on the go-live checklist (Section D.6).

## A4 — DMCA & Copyright Policy: designated agent placeholders

**Where.** DMCA & Copyright Policy, "Designated DMCA Agent".

**What the document says.** `[NAME OR POSITION]`, `[TELEPHONE NUMBER]`,
`[DEDICATED DMCA EMAIL]`.

**What is needed.** The real values, once the agent is registered.

**What we did in the meantime.** The published `/dmca` page does **not** show
the placeholders. While they are unfilled, the agent block is replaced with an
interim notice directing notices and counter-notices to
`support@customcanvas.shop` with "DMCA" in the subject, stating that we act on
those exactly as we would on notices to the designated agent, and that
registration is in progress. The substitution keys on the placeholders
themselves, so the moment counsel's filled text lands in the markdown the real
block publishes with no code change.

**Two things must happen before this is finished, and both are Chris's:**

1. Register the designated agent with the U.S. Copyright Office DMCA Designated
   Agent Directory (the $6 filing). Safe harbor under §512 depends on this
   registration existing, not on the page.
2. Create the dedicated mailbox (e.g. `dmca@customcanvas.shop`) on the existing
   mail provider. Resend sends but does not receive, so this needs the domain's
   actual mail host.

Then give counsel the name/position, telephone number and email for A4.

---

## Everything else checked out

For completeness, these were verified against the code and need no change: the
15% / 85% + 100%-of-shipping split and the $1,000/$40 → $890 worked example;
Stripe Express with a 14-day payout delay; all six protection requirements and
the fixable-versus-frozen distinction; delivery confirmation being the artist's
attestation (which the documents now correctly disclose); commissions being
arranged and paid off-platform; the CUSTOM CANVAS statement descriptor; the
5-business-day window being shown on every listing; and reviews being one per
delivered order.
