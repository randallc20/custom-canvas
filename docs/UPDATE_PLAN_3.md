# UPDATE PLAN 3 — Product Honing ("Build 3")

*Agreed 2026-07-03. Source: product critique + decisions session against `docs/PRODUCT_BREAKDOWN.md` (snapshot @ `538217b`). Same rhythm as Build 2: each phase is independently shippable with done-criteria; one PR per phase.*

## North Star

Custom Canvas is a **marketplace for art, hammering the local-art-for-local-people path** — and it intends to grow into a **social platform for discovering, buying, and supporting local artists**. Build 3 decisions should read through that lens: the feed and filters are the marketplace core (kept as-is); curation shelves exist to make *local* legible, not to turn the site into a gallery; and the social primitives already in place (follows, saves, messaging, notifications) are strategic seeds — the follow→notify→buy loop (Phase 3) is the first working social mechanic, and chat-first commissions (Phase 5) makes messaging the platform's connective tissue.

## Direction (locked)

Two moments drive every phase: **a buyer's first 60 seconds** and **an artist's decision to list here instead of Instagram**. The honing thesis: the warm-Houston brand promises local intimacy, but parts of the product undercut it — an uncurated first screen where nothing says "chosen for Houston," a fee ambush at checkout, and an artist console that feels like admin software (7 pages, duplicated commission surfaces). Build 3 closes that gap without adding feature surface.

Decisions made:

| Area | Decision |
|---|---|
| Homepage | **Curator's shelf**: admin-curated Featured shelf + one computed shelf above the existing feed |
| Buyer fee | **5% capped at $15** replaces the flat $10; fee disclosed on the listing page, not just checkout |
| Artist console | **4-section Studio** (Studio home / Work / Sales & Money / Public Page); Analytics page dissolves |
| Commissions | **Chat-first**: the conversation is the commission's home, status drawer in-thread, visible states 9 → 5 (display-only) |
| Commissions nav | **Fold into Messages** — inbox gets All / Commissions tabs; `/commissions/*` redirects |
| Sales engine | **Email fan-out ships** (new-listing-to-followers, price-drop-to-savers), incl. the API-write-path prerequisite |
| Partners | **Partner picks** as the final phase (homepage shelf + partner-page section); directory keeps its nav slot |

## Explicitly OUT of scope

- **Feed & filters — unchanged** (decision): schools facet stays, commissions-open toggle stays, contact-for-price ranking stays.
- Buyer identity / public buyer profiles — deliberately thin for launch, but flagged as the **first post-launch seed of the social layer** (collector profiles, public saves/collections) per the North Star.
- Money model beyond the fee swap (15% take rate untouched; "85% to artists" headline remains true and unchanged).
- LAUNCH.md items (prod Stripe/Supabase, DNS, key rotation, etc.).
- Admin suite redesign.
- DB rewrites — Build 3 adds at most two small tables and touches no existing columns' semantics.
- Design language replacement — every phase uses existing Warm Houston Gallery tokens/primitives (§13), evolved not replaced.

---

## Phase 1 — Fee model + upfront disclosure

Smallest, fully independent, immediate trust win.

**Scope**
- `commissionCalc.ts`: buyer service fee becomes `min(round(price_cents * 0.05), 1500)` (5%, $15 cap). Artist economics unchanged (85% of price + 100% shipping). Extend the money-conservation unit tests for the new formula, incl. cap boundary and rounding edges.
- Checkout session creation locks the new fee into Stripe metadata exactly as today.
- **Listing page**: price block shows the service fee before checkout (e.g. "$300 · + $15 service fee — artists keep 85%"). Tone: gallery-transparent, not e-commerce fine print.
- Copy sweep: about page / any pricing copy explains "5% service fee (max $15)". Canonical example updates ($300 piece + $20 shipping → buyer pays $335 + tax; artist $275; platform $60).
- Checkout breakdown line item renamed/recomputed.

**Done when**
- Unit tests pass incl. conservation at $1, $50, $299.99-equivalent cents, $300 (cap boundary), $5,000.
- A live staging purchase (Stripe test mode) shows the 5% fee on listing page, checkout breakdown, order record, and both confirmation emails.
- No page still says "$10" anywhere (grep the copy).

## Phase 2 — Homepage curator's shelf

The first screen finally says "local art, chosen for Houston"; the marketplace feed below is untouched. Shelf voice is local-first ("Featured in Houston", "From the Heights"), not art-world editorial.

**Scope**
- New table `featured_listings` (`listing_id` FK unique, `display_order`, `featured_at`, admin-only writes via RLS; joined listings must be `available`). Additive migration; grant-only-new-functions convention applies.
- Admin: a "Featured" manager (add/remove/reorder, ~6–10 slots) — a small section in the existing admin suite, not a new subsystem.
- Homepage restructure: hero → **Featured shelf** (horizontal scroll of existing listing cards, Fraunces section header, sand section band) → **one computed shelf** ("From {neighborhood}" spotlight rotating weekly by a deterministic function of week number — no cron needed) → existing feed with its full current filter/sort UI.
- Shelves hide themselves when empty (no sad placeholder states on day one).
- Sold/hidden featured pieces drop out automatically (join on status).

**Done when**
- Admin can feature/reorder/unfeature; homepage reflects it without deploy.
- Neighborhood shelf rotates (verify by overriding week seed in dev).
- Feed behavior, filters, and URL params byte-for-byte unchanged below the shelves.
- Lighthouse/scroll perf on homepage not regressed (shelves lazy-load images).

## Phase 3 — Sales engine: listing write-path + email fan-out

Prerequisite refactor first, emails second. Runs **before** the Studio phase so Studio's Work page is built on the new write path, not the old client-SDK writes.

**Scope**
- Route listing create/update/publish/price-change through API routes (they currently go through the client SDK, so the server never sees the events — §16.1). Keep RLS as the safety net; the API layer adds the event hooks.
- **New-listing email** to followers on publish (reuses the existing once-per-listing notification stamp so in-app + email share one debounce).
- **Price-drop email** to savers (reuses the existing 24h debounce stamp).
- Both respect `email_preferences` flags + tokenized unsubscribe, batched sends via Resend, and are idempotent (follow the `drip_emails_sent` log pattern).

**Done when**
- Publishing a listing as Ada sends the follower email (buyer.test receives it) exactly once, even on double-publish or webhook-style retries.
- Price drop on a saved listing emails the saver once per debounce window.
- Opted-out users get in-app only.
- Listing CRUD from the UI fully works through the new routes (create, edit, publish, delete, image flows untouched).

## Phase 4 — Artist Studio (7 pages → 4)

The biggest phase. Console stops being admin software; one page answers "what needs me today?"

**Scope**
- **`/studio`** (home): needs-attention queue (orders to ship, commission actions pending, unread inquiries), 7-day stat strip (views/saves/followers/earnings), completeness card, away-mode toggle, Houston Verified card, pinned-work selector. Absorbs `/dashboard` + `/analytics` summary.
- **`/studio/work`**: unified listings manager — drafts, published, sold; series as grouping/tabs within it (absorbs `/series`); each row shows per-listing lifetime views/saves (existing counters) and status. Create/edit forms unchanged in this phase (their duplication is Phase-4 cleanup only if cheap; otherwise noted debt).
- **`/studio/sales`**: sales orders + payouts merged — order list with payout state per order, Stripe Connect status card, earnings stats (absorbs `/sales` + `/payouts`).
- **`/studio/page`**: the profile editor (`/profile/edit` renamed), preview-as-visitor promoted to a primary action.
- Redirects: `/dashboard`, `/listings`, `/series`, `/sales`, `/analytics`, `/payouts`, `/profile/edit` → their Studio homes (old links in emails keep working).
- Artist navbar entry becomes "Studio" (single item with the 4 sections as sub-nav).
- The 30-day charts survive as a collapsed "Trends" section on Studio home (nothing deleted, just demoted).

**Done when**
- Every capability of the 7 old pages is reachable in ≤2 clicks from `/studio`; nothing lost (checklist against §4's artist-only table).
- All 7 old routes 301/redirect correctly, including deep links (`/listings/[id]/edit` untouched).
- The needs-attention queue shows a pending shipment, a quoted-awaiting commission, and an unread inquiry for a seeded artist.
- Mobile nav works (4 sections, no horizontal overflow).

## Phase 5 — Commissions live in chat

**Scope**
- **Status drawer** in the conversation thread for commission-anchored conversations: current status, quote details, WIP timeline, progress bar, and the role-appropriate action buttons (quote / accept / decline / post update / mark delivered / confirm receipt / report issue). Collapsible rail on desktop, sheet on mobile.
- **Display-state mapping** (no schema, no state-machine change; all DB transitions and API ownership checks stay exactly as-is):
  `pending` → "New request" · `quoted` → "Quoted" · `accepted`,`in_progress` → "In progress" · `completed`,`delivered` → "Delivered" · `confirmed`,`declined`,`cancelled` → "Closed" (with reason sub-label) · `disputed` → badge overlay.
- **Inbox merge**: `/messages` gets All / Commissions tabs; commission conversations show a status pill in the list. Navbar "Commissions" item removed for all roles.
- `/commissions` → inbox Commissions tab; `/commissions/[id]` → its conversation thread (redirects — notification/email deep links keep working).
- WIP updates: posting from the drawer also drops a system/update message into the thread so the conversation reads as one story (the append-only `commission_updates` table remains the source of truth).

**Done when**
- Full lifecycle (request → quote → accept → WIP ×2 → delivered → confirmed) is completable without ever leaving the thread, as both artist and buyer test accounts.
- Dispute path still routes to admin and shows the badge.
- All old `/commissions/*` deep links (incl. from existing notification records and emails) land on the right thread.
- The 14-day nudge cron and all commission emails are unaffected.

## Phase 6 — Partner picks

Partners graduate from trust decor to a discovery engine.

**Scope**
- New table `partner_picks` (`gallery_id`, `listing_id`, optional short blurb, `display_order`; cap ~6 per partner enforced app-side + CHECK/trigger; RLS: verified partners write their own rows only; picks of hidden/sold listings drop out via status join).
- Partner dashboard gains a "Your picks" manager (add from search, blurb, reorder).
- **Homepage**: a "Picked by {partner}" shelf slots under the Phase-2 shelves, rotating among verified partners with ≥3 live picks.
- **Partner page**: "Our picks" section above the roster.
- `/partners` directory unchanged, keeps its nav slot (decision).

**Done when**
- A verified partner (bayou-city-gallery demo account) can curate picks; they render on their page and rotate onto the homepage.
- Unverified partners cannot write picks (RLS-verified, cross-account attempt blocked).
- Picks of sold/hidden work disappear without manual cleanup.

---

## Sequencing notes

- 1 and 2 are quick wins and can land in either order; 3 must precede 4 (Studio builds on the API write path); 5 is independent of 4 but lands after so the artist nav settles once; 6 is last and deferrable without harming the rest.
- Each phase = one PR against master, staging-verified with the seeded demo accounts before the next begins (Build 2 rhythm).
- Deferred debt untouched by this plan (still open from §16): Upstash rate limiting, skipped Playwright critical-path suite, remaining inline-Supabase files beyond the listing write path, create/edit form duplication if not absorbed in Phase 4.

---

## Build log — deviations & addenda (2026-07-03)

All 6 phases implemented on master. Deviations from the plan above, and items that fell out of the build:

- **Commission state machine changed (deliberate deviation from Phase 5's "no state-machine change").** Review found quote-acceptance jumped straight to terminal `confirmed`, making WIP updates unreachable. Action routes now enforce guarded transitions (409 on out-of-order calls): quote accept goes `quoted → in_progress` (`accepted` is legacy-only for new data), receipt confirm goes `delivered → confirmed`, decline/cancel only from `pending`/`quoted` (writes `cancelled` — `declined` was never a DB status), deliver only from `accepted`/`in_progress`, quote only from `pending`, dispute only from `in_progress`/`delivered` (reason ≤2000 chars). Commission creation now fails hard if its conversation can't be created.
- **7-day stat strip omits follower count** (plan said views/saves/followers/earnings; shipped views/saves/orders/earnings). Analytics events don't track follows per-artist cheaply — deferred.
- **Systemic pre-existing auth bug fixed en route:** the browser Supabase client kept sessions in localStorage, so ALL authed API routes 401'd in real browsers. Now cookie-backed via `@supabase/ssr` `createBrowserClient`.
- **Money-path hardening beyond plan scope:** admin partial refunds reject out-of-range amounts (400) instead of escalating to full; `charge.refunded` ignores partial refunds (only full refunds close the order/relist); oversell refund failure now 500s so Stripe retries; confirmation email total uses Stripe's tax-inclusive `amount_total`; legacy sessions without fee metadata record the old flat $10.
- **Environment-blocked:** migrations 00024–00026 (`00024_featured_listings`, `00025_publish_notifications` — email claim stamps + guard only, `followers_notified_at` came from 00022 — and `00026_partner_picks`) are **not applied to the DEV/staging database** (no DB credentials in the build environment). Until applied: shelves hide themselves, the picks manager errors, alert emails silently skip (claims fail soft). Staging E2E of the fee model, emails, and shelves is pending that. Apply via the IPv4 session pooler:

  ```bash
  for f in supabase/migrations/00024_featured_listings.sql \
           supabase/migrations/00025_publish_notifications.sql \
           supabase/migrations/00026_partner_picks.sql; do
    psql "postgresql://postgres.<dev-ref>:<password>@aws-1-<region>.pooler.supabase.com:5432/postgres" -f "$f"
  done
  ```
