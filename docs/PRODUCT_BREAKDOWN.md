# Custom Canvas — Complete Product Breakdown

*Snapshot: 2026-07-01, master @ `538217b`. Written as a standalone reference for product redesign work — no codebase access needed to use this document.*

---

## 1. What It Is

**Custom Canvas** is a Houston-focused marketplace for original art. Artists sell finished pieces and take custom commissions; buyers discover local art through a feed, search, and artist profiles; verified partner organizations (galleries, schools, museums) anchor the local-trust story. The platform takes 15% of each sale plus a flat $10 buyer fee; artists keep 85% plus full shipping.

- **Stack:** Next.js 14 (App Router) + Supabase (Postgres/Auth/Storage/Realtime) + Stripe (Checkout, Connect Express, Tax) + Resend (email) + Sentry, deployed on Vercel.
- **Staging:** https://custom-canvas-chi.vercel.app (auto-deploys on push to master).
- **Scale of build:** ~35 screens, 40 API routes, 23 DB migrations, 4 cron jobs, 12 transactional email types, full commission + order + chat systems.
- **State:** feature-complete for launch ("Build 2" — all 9 phases done); remaining work is launch configuration (live Stripe, prod Supabase, domain) and deferred polish (see §12).

### Positioning pillars (as expressed in the product)
1. **85% to artists** — repeated on homepage, about page, payouts page.
2. **Houston-local** — neighborhoods as filter facets, "Houston Verified" badge, local pickup as a first-class fulfillment mode, partner orgs (Glassell School, galleries).
3. **Commissions welcome** — commission-only listings, per-artist commission panels, a full quote → WIP → delivery workflow.

---

## 2. Business Model & Money Flow

**Fee math** (`src/utils/commissionCalc.ts`, unit-tested for money conservation):

| Party | Gets / Pays |
|---|---|
| Buyer pays | price + $10 service fee + artist-set shipping + sales tax |
| Artist receives | 85% of price + 100% of shipping (instant Stripe Connect transfer) |
| Platform keeps | 15% of price + $10 buyer fee |
| Tax | Calculated by Stripe Tax at payment, collected/remitted by platform |

Canonical example: $300 piece + $20 shipping → buyer pays $330 (+tax), artist gets $275, platform keeps $55.

**Mechanics that protect the money path:**
- Economics are **locked into Stripe session metadata at checkout creation** — a price edit mid-checkout can't change what settles.
- **One live order per listing** enforced by a partial unique DB index; the webhook auto-refunds (with transfer reversal) if a race double-sells.
- Order creation is **idempotent** on `stripe_payment_intent_id` (unique constraint) so webhook retries can't duplicate orders.
- Money columns on orders are **frozen at the DB level** for non-admin users; artists can only advance status to shipped/delivered.
- Refunds: buyer can self-cancel while status is `paid` (atomic claim → Stripe refund with `reverse_transfer`); admin can issue partial/full refunds for disputes. `charge.refunded` webhook returns the listing to market.

---

## 3. Roles & Access Model

Four roles on `profiles.role`: **user** (buyer), **artist**, **gallery** (partner org), **admin**.

- Signup offers Artist / Art Lover / Partner; the DB trigger sanitizes anything else to `user` (self-admin escalation was found and fixed — migration 00023).
- Role changes are admin-only (DB guard trigger).
- Route gating is **client-side** via an `AuthGuard` component per layout/page (redirects to `/login?returnUrl=…`); there is no server middleware auth — middleware only does per-IP rate limiting. Data safety comes from RLS, not routing.
- Sensitive columns (verification flags, Stripe fields, completeness score, order money) are frozen by DB triggers unless the caller is service-role/admin.

| Area | user | artist | gallery | admin |
|---|---|---|---|---|
| Browse/search/profiles | ✓ (also anon) | ✓ | ✓ | ✓ |
| Save, follow, buy, review, commission-request | ✓ | ✓ | ✓ | ✓ |
| Dashboard, listings, sales, series, analytics, payouts | — | ✓ | dashboard only | — |
| Messages, notifications, account | ✓ | ✓ | ✓ | ✓ |
| Admin suite | — | — | — | ✓ |

---

## 4. Complete Screen Inventory

### Public (no auth)
| Route | Purpose | Key actions |
|---|---|---|
| `/` | Home: hero + value props + infinite discovery feed | Search, filter, save, follow, open listing/artist |
| `/artist/[slug]` | Artist portfolio: hero (custom accent color + chosen bio layout), pinned work (≤3), series-tabbed gallery, "My Story", education timeline, Meet-the-Artist photos/videos, reviews, commission panel | Follow, save, message, request commission, buy |
| `/listing/[id]` | Listing detail: image carousel, dims/medium/year, tags, price or "Contact for price", artist sidebar, related works | Save, share (native sheet / copy, dynamic OG image), message artist, checkout |
| `/gallery/[slug]` | Partner profile: banner, type badge, roster artists + auto-linked alumni/students | Open artist profiles |
| `/partners` | Partner directory, filterable by type | Filter chips, open partner |
| `/about`, `/terms`, `/privacy` | Static | — |
| `/unsubscribe?token=` | One-click email opt-out (CAN-SPAM) | — |

### Auth flow
`/register` (role picker, terms checkbox, email-confirm gate) → `/onboarding/artist` (3-step wizard: basics → about → preferences incl. fulfillment + commissions toggle) or `/onboarding/gallery` (org details → "pending verification" state). Plus `/login`, `/forgot-password`, `/reset-password`. Mid-checkout guests are bounced to register and returned via `returnUrl`.

### Authenticated (all roles)
| Route | Purpose |
|---|---|
| `/account` | Profile basics, email preferences, password change, delete account (type-DELETE confirm) |
| `/saved` | Saved art masonry grid |
| `/following` | Followed artists list |
| `/orders` | Buyer order history: status badges, tracking, cancel-&-refund (while paid), leave review (once delivered) |
| `/checkout/[listingId]` | Order review + shipping address form (skipped for pickup) → Stripe Checkout |
| `/messages`, `/messages/[id]` | Split-pane inbox + thread (see §8) |
| `/commissions`, `/commissions/[id]` | Commission list (Received/Sent tabs for artists) + detail with status-dependent actions |
| `/commission-request?artist=` | Commission brief form |
| `/notifications` | Full notification center, mark-read |

### Artist-only
| Route | Purpose |
|---|---|
| `/dashboard` | Completeness bar, pending-shipment alerts, away-mode toggle, Houston Verified card, pinned-work selector, quick links |
| `/listings` | Manage listings (publish drafts, edit, delete) |
| `/listings/new`, `/listings/[id]/edit` | Full listing form + image upload/reorder (≤8 images, first = cover) |
| `/series` | Create/reorder/delete series with cover images |
| `/sales` | Seller order view: payout breakdown, mark shipped (tracking #), mark delivered |
| `/analytics` | 30-day views/saves/followers/orders/earnings + bar charts |
| `/payouts` | Stripe Connect onboarding / connected state + earnings stats |
| `/profile/edit` | Full profile builder (see §6) |

### Admin (`/admin/*`)
Dashboard (users/artists/listings/orders counts, revenue + fee totals, 30-day charts, recent activity) · Users (search, roles) · Listings (search, hide/remove) · Orders (status filter, revenue/fee/payout totals) · Galleries (verify/reject partner applications) · Disputes (resolve reports: dismiss / action-taken / reviewed + notes) · Verifications (approve/reject Houston Verified requests).

---

## 5. Feature System: Discovery

- **Feed** (`/`): infinite scroll, offset pagination with stable tiebreak. Two views: **Art** (listings) and **Artists** (browse cards with 3-thumbnail strip + follow button).
- **Sorts:** Newest (default), Price ↑, Price ↓, Most Saved.
- **Filters** (all URL-param backed → shareable): full-text search, medium, price range, Houston neighborhoods (multi), art schools (multi), commissions-open, availability (Available / Commission).
- **Search:** Postgres `tsvector` + GIN on listings (title/description/medium) and artists (name/bio/neighborhood/school). Navbar search has 300ms-debounced autocomplete (top 3 artists + top 3 listings) and routes to `/?q=`.
- **Recently viewed:** last 12 listings, localStorage, shown above feed for returning visitors.
- **Related listings:** up to 4 more available works from the same artist on listing detail.
- Cards show cover image (`is_primary`), title, artist, price/"Contact for price", save heart with pop animation.

## 6. Feature System: Artist Profile Builder

Everything an artist controls, with a gamified **completeness score** (0–100, DB-canonical via RPC):

| Element | Detail | Points |
|---|---|---|
| Display name | required | 10 |
| Story | free-length "My Story" public section (100+ chars to score) | 15 |
| Primary mediums | chips, ≤10 | 5 |
| Neighborhood | Houston-area facet | 5 |
| Fulfillment pref | ships national / ships local / pickup only / artist delivered | 10 |
| Avatar / Banner | signed-URL uploads | 10 / 5 |
| ≥1 listing | | 20 |
| Stripe onboarded | | 10 |
| Education entry | | 5 |
| Personal photo | | 5 |

Plus: bio, artist statement, influences, school + grad year, status (student/recent grad/working artist), website, **accent color** (16-swatch palette, themes their public CTAs/tabs), **bio layout** (left/center/minimal), **pinned work** (≤3, reorderable), **series** (create/reorder, portfolio tabs), **education timeline** (auto-links to verified partner orgs by institution name → artist appears on that partner's page as alumni), **personal photos** (≤10 + captions), **videos** (≤5, 200MB, lazy-loaded), commission settings (open flag, description, minimum price, turnaround), **away mode** (banner, disables Buy, pauses commissions, optional auto-reply, auto-restores on return date via cron), and a **preview-as-visitor** mode.

**Houston Verified:** artist submits connection type + details + evidence links → admin queue → badge + notification + email. One pending request at a time (DB constraint); self-verification blocked at DB level.

## 7. Feature System: Listings

- **Fields:** title, description, medium, W/H/D cm, year, price (integer cents everywhere; forms in dollars), shipping rate (hidden for pickup-only artists), price-visible toggle ("Contact for price" flow → message artist), series, tags (curated vocabulary: medium/style/subject/mood), sold price + show-sold-price (for provenance display).
- **Statuses:** `draft` (owner-only) → `available` → `sold`; also `hidden` (delisted) and `commission_only` (portfolio piece, inquiries only).
- **Images:** up to 8 per listing, 5MB each (JPEG/PNG/WebP), drag-drop with progress, reorder/remove, first = cover (`is_primary` kept in sync with order for feed cards vs carousel).
- **On publish:** followers get an in-app notification (once per listing, DB-triggered). **On price drop:** savers notified (24h debounce). Both currently in-app only (email fan-out deferred — §12).
- View / save counts tracked per listing and feed into "Most Saved" sort and analytics.

## 8. Feature System: Chat & Messaging

- 1:1 conversations, optionally anchored to a **context** (listing or commission) shown as a banner card at the top of the thread.
- "Message Artist" from a listing pre-fills the thread and pins the piece; system messages appear for events (e.g., pickup coordination after purchase).
- **Message types:** text, image, listing card (artist shares own work), quote card (commission quote with in-thread Accept/Decline), system.
- **Attachments:** images + PDFs ≤10MB in a **private** bucket rendered via signed URLs, scoped to participants; lightbox viewing.
- **Realtime** via Supabase postgres_changes; unread counts in navbar; cursor-paginated history; read-marking per conversation.
- **Safety:** block user (DB-enforced — blocked senders can't insert messages), mute thread, report message/user. Message content is immutable after send (DB guard); only `is_read` can change.
- Away-mode auto-reply fires at most once per conversation.

## 9. Feature System: Commissions

Lifecycle (DB-enforced status set):

```
pending ──quoted──▶ accepted ──▶ in_progress ──▶ completed ──▶ delivered ──▶ confirmed
   │        │
declined  cancelled                (disputed possible from active states)
```

1. **Request:** buyer (or partner, shown with partner badge) submits title, brief (10–5000 chars), budget min–max. Creates a linked conversation; artist gets in-app + email notification.
2. **Quote:** artist sends price, estimated completion, notes → status `quoted`, quote card posted into the thread; buyer accepts (in-thread or on detail page) or declines.
3. **WIP updates:** artist posts note + optional photo + optional 0–100% progress slider; append-only timeline; buyer notified in-app + email. Stale commissions (14+ days quiet) trigger a daily **nudge email** cron to the artist.
4. **Delivery:** artist marks delivered → buyer confirms receipt or reports an issue (dispute, routed to admin).
5. All status transitions run through **server API routes with ownership checks** (direct DB updates by users are revoked).

## 10. Feature System: Orders, Reviews, Notifications, Email

**Checkout:** listing detail → `/checkout/[id]` → price breakdown (+fee +shipping, "tax at payment") → address form (skipped for pickup) → Stripe Checkout → webhook creates order (`paid`), marks listing sold, emails both parties; pickup orders auto-open a chat thread with a system message. Statuses: `pending → paid → shipped (tracking #) → delivered`, plus `refunded`/`disputed`. `delivered_at` is stamped immutably (feeds review reminders).

**Reviews:** one per order, buyer-only, only after `delivered` (DB-enforced). 1–5 stars + comment. Shown on artist profile (≤20) with aggregate; artist gets notification + email. A daily cron emails buyers 7+ days post-delivery who haven't reviewed (once).

**Notifications (16 types):** new message / follower / order / listing-from-followed-artist / price drop / commission request-accepted-declined-completed-confirmed-disputed-update / review received / listing reported / payout sent / Houston Verified. Surfaced in a navbar dropdown (realtime) and `/notifications`.

**Email (Resend, 12 templates):** welcome (role-specific), new message, commission request/update/nudge, order confirmation, new sale, shipping update, review received, review request, artist onboarding drips (day 1/3/7 until profile is live), buyer drip (day 1 if zero engagement). All respect `email_preferences` JSONB (marketing, new-listing, message, price-drop flags) + tokenized one-click unsubscribe. Drips are idempotent via a `drip_emails_sent` log table.

**Crons (Vercel, `CRON_SECRET`-protected, daily):** commission nudges (15:00 UTC), review reminders (16:00), away-mode auto-disable (05:00), onboarding drips (17:00).

## 11. Data Model (condensed)

**Identity:** `profiles` (role, avatar, email prefs, unsubscribe token, terms-accepted-at) → 1:1 optional `artist_profiles` (all §6 fields + slug, search vector, Stripe fields, away mode, alert debounce stamps) or `gallery_profiles` (partner type enum ×8, verification fields).

**Catalog:** `listings` (+ search vector, counters, notification stamps) → `listing_images`, `listing_series`, `tags`/`listing_tags`. `artist_education` (auto-linkable to partners), `artist_personal_photos`, `artist_videos`, `gallery_artists` (roster).

**Engagement:** `saved_listings`, `follows`, `analytics_events` (profile_view / listing_view / listing_save / listing_share / follow, artist-scoped).

**Comms:** `conversations` (participants, context, last-message cache, away-autoreplied flag) → `messages` (typed) → `message_attachments`; `blocked_users`, `muted_conversations`.

**Transactions:** `commissions` → `commission_updates` (append-only); `orders` (full fee breakdown, shipping JSONB, tracking, payment-intent unique, one-live-per-listing partial index, delivered_at) → `reviews` (order-unique).

**Ops:** `notifications`, `reports` (listing/user/message, admin resolution fields), `verification_requests` (one pending per artist), `drip_emails_sent`.

**Storage buckets:** listing-images / avatars / banners / artist-photos public (2–5MB, image MIME-locked); artist-videos public (200MB); chat-attachments **private** (10MB, participant-scoped reads). Upload paths namespaced by user id; all uploads via server-issued signed URLs.

**Security posture (DB):** RLS everywhere; column-freeze guard triggers on roles, verification flags, money, message content; privileged writes only via service-role or `SECURITY DEFINER` RPCs (`refresh_completeness_score`, `link_education_partners`, `is_privileged`). Four security incidents found-and-fixed during build: self-admin signup, review fraud, order tampering, attachment spoofing.

## 12. Server Surface (40 API routes)

- **Payments:** `POST /api/payments/checkout` (locks economics into session), `POST /api/payments/stripe-connect` (Express onboarding). **Webhook** `/api/webhooks/stripe`: checkout.session.completed (order + emails + oversell auto-refund), charge.refunded (reconcile + relist), payment_intent.payment_failed (Sentry breadcrumb), account.updated (flip `stripe_onboarded`, refresh completeness).
- **Orders:** buyer cancel; admin partial/full refund.
- **CRUD + flows:** listings, artists (+pinned), commissions (+6 action routes), conversations/messages/read, reviews, follows, saved, notifications, analytics (track + 30-day rollup), galleries (verify/reject), admin stats, admin verifications, unsubscribe.
- **Storage:** 6 signed-upload endpoints (one per bucket) from a single factory.
- **Rate limiting:** in-memory sliding window per IP per route-prefix in middleware (60/min default; tighter on writes: listings 10, commissions/reviews/reports 5; feed 120). Webhooks/crons exempt. *Per-instance only — Upstash Redis is the planned upgrade.*
- **Sentry:** prod-only, full traces, session replay on error; webhook failures return non-2xx so Stripe retries.

## 13. Design System — "Warm Houston Gallery"

**Idea:** neighborhood gallery, not corporate marketplace. No pure black or white anywhere.

| Token | Hex | Use |
|---|---|---|
| `cream` | #FAF6F0 | page background |
| `surface` | #FFFFFF | cards, art containers |
| `ink` | #2D2A26 | primary text (warm charcoal) |
| `muted` | #6F6A63 | secondary text |
| `line` | #E9E2D8 | borders/dividers |
| `terra` / `terraDark` / `terraSoft` | #E8704A / #C95A38 / #FBEAE2 | accent CTA / hover / tinted bg |
| `sage` | #7C8B6F | success/verified |
| `sand` | #F1E8DA | alt section bg, chips |

**Type:** Fraunces (serif, 500–700) for h1–h3/hero/artist names; DM Sans for body/UI.
**Shape & depth:** rounded-full buttons/pills/chips, rounded-xl cards/inputs, soft warm shadows (`0 2px 12px rgba(45,42,38,.07)`).
**Motion:** fade/rise reveals (CSS transitions after a Tailwind-purge bug killed keyframe reveals in prod), card-hover lift, press scale, heart-pop, toast/modal entrances; full `prefers-reduced-motion` support.
**Primitives:** Button (5 variants × 3 sizes, loading), Input, Toast (4 types, context API), Modal (portal, esc, scroll-lock), ConfirmDialog (promise API), Badge (6 variants incl. verified-with-check), Avatar (initials fallback), FilterChip, EmptyState, Skeleton, Spinner, ShareButton.
**Personalization:** each artist's accent color re-themes their own public page CTAs/tabs; bio layout choice changes the hero.

## 14. Architecture Conventions

- Layering rule: Components → Hooks → Services → Lib (violated in ~25 files that query Supabase inline — known debt).
- TanStack React Query for all server state (hierarchical keys, invalidation on mutation, infinite queries for feed/messages); Contexts for auth, notification count, unread messages.
- react-hook-form + Zod resolvers for every form; one Zod schema file per domain.
- Money is integer cents end-to-end; dollars only at the form edge with `Math.round`.
- URL params are the source of truth for feed state (shareable, back-button friendly).
- Every destructive action → ConfirmDialog; every list → EmptyState; every async → loading state.
- TypeScript strict, no `any`.

## 15. Tooling, Tests, Seeds

- **Unit (Vitest):** money math (`commissionCalc` — conservation + rounding edges), price formatting, order records.
- **E2E (Playwright):** 4 live public smoke tests; 5 critical-path specs scaffolded but **skipped** (need seeded env vars) — register→onboard, create listing, purchase, commission flow, realtime message.
- **Seeds:** `scripts/seed_demo.py` (Houston artists, verified gallery + school, listings, reviews; idempotent) and `seed_rich.py` (photographic images + fully-populated buyer). Demo accounts `<slug>@cc-demo.com` / `DemoPass123!`; test accounts `*.test@customcanvas.dev` / `TestPass123!` (buyer fully populated; Ada is Stripe-connected).
- CI runs lint/build; Vercel auto-deploys master.

## 16. Known Gaps & Deferred Work (honest debt list)

1. **Email fan-out for follower/new-listing and price-drop alerts** — in-app only today; emails need listing writes routed through API routes (they currently go through the client SDK, so the server never sees the event).
2. **Rate limiting is per-instance memory** — move to Upstash Redis for real global limits.
3. **Critical-path E2E suite is skipped** — needs seeded CI accounts to activate.
4. **~25 files query Supabase inline** instead of through the services layer.
5. **Auth gating is client-side only** — fine given RLS, but a redesign touching routing should consider server-side gates.
6. **Launch checklist open** (LAUNCH.md): prod Supabase, live Stripe (LLC + Tax registration), Resend domain DNS, getcustomcanvas.com, key rotation, re-enable email confirm, prod smoke test.
7. **Backlog ideas parked:** collections, "view in a room", invoice downloads.

## 17. Redesign Friction Points (observations, not prescriptions)

- **Two parallel "custom work" surfaces:** the commission flow and the chat quote-card overlap conceptually; the status machine (9 states) may be heavier than users need.
- **Create vs. edit listing are duplicated forms** (~170 lines each, drifted slightly); same for the two onboarding wizards.
- **Navigation is role-fragmented:** artists juggle Dashboard / Listings / Sales / Series / Analytics / Payouts / Profile-edit as separate pages; a redesign could consolidate (compare the visit-ledger consolidation you did in Flightsheet).
- **Buyer identity is thin:** buyers have no public presence; reviews show just a name. Deliberate, but worth revisiting for community feel.
- **The $10 flat buyer fee** is regressive on low-price work ($50 print → 20% effective fee) — pricing-page copy hides this until checkout.
- **Discovery is one feed + filters** — no editorial surfaces (curated collections, neighborhood pages, partner-curated picks) despite the partner system existing.
- **Analytics is 30-day-only** and unsegmented; artists can't see which listing drives views.
- **Away mode, drafts, price-visible, sold-price display** are power features scattered across pages with no unified "shop settings" home.
