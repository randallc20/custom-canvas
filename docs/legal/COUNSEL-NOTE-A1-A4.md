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

## A4 — RESOLVED 2026-09-03

Counsel returned the filled document (`Custom Canvas - 8 DMCA and Copyright
Policy.docx`, received 2026-09-03) and Chris completed the registration. The
designated agent block now reads:

> **Designated DMCA Agent**
> Managing Member, Custom Canvas LLC
> 3120 Southwest Freeway, Suite 101 #991985, Houston, Texas 77098
> Telephone: (832) 319-4756 · Email: support@customcanvas.shop
>
> Custom Canvas LLC is registered with the U.S. Copyright Office as a service
> provider under 17 U.S.C. §512(c)(2). **Registration number: DMCA-1079827.**

Two consequences worth recording:

- **Safe harbour now rests on a real registration**, not on the page. That was
  the item that could not be closed from the code side.
- **There is no separate `dmca@` mailbox and none is needed** — counsel put
  `support@customcanvas.shop` in the agent block, so the address the policy
  publishes is one that already receives mail. The runbook's "create the
  dedicated mailbox" step is struck.

`/dmca` published the real block the moment the filled text landed in the
markdown: the interim substitution keys on the placeholders themselves, so no
deploy or code change was needed to switch it over.

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
