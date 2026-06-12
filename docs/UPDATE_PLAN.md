# CUSTOM CANVAS — MASTER UPDATE PLAN (Build 2)

**Purpose:** This document is the complete specification for upgrading the existing
Custom Canvas build (209 files, 33 pages, 29 API routes) to launch-ready state.
Hand this to Claude Code alongside the existing repo. Work through phases in order.
Each phase has a "Done when" condition — verify it before starting the next phase.

**Repo:** github.com/randallc20/custom-canvas
**Baseline:** Build Summary dated current commit `7371423`

---

## NON-NEGOTIABLE RULES (unchanged from original build)
- Components → Hooks → Services → Lib. No layer skipping.
- Money = integer cents. All conversions via Math.round().
- Tailwind only. next/image for all images. next/link for all links.
- TypeScript strict. Zero `any`, zero `@ts-ignore`, zero `console.log`.
- All write endpoints validate auth + ownership.
- Every destructive action gets a confirmation modal.
- Every list has an EmptyState. Every async op has a loading state.

---

# DESIGN DIRECTION — "Warm Houston Gallery"

Every phase that touches UI builds to this spec. Apply it as a global
restyle pass during Phase 1 (it's mostly tailwind.config + layout fonts),
then all subsequent phases inherit it.

**Vibe:** Warm & approachable. A neighborhood gallery where you know the
artists — not a white-cube institution, not a SaaS dashboard. Friendly,
memorable, alive. The chrome stays quiet so the art pops; warmth comes
from the surfaces AROUND the art, never tinting the art itself.

## Color system (tailwind.config tokens)
```js
colors: {
  cream:    '#FAF6F0',  // page background — warm, never pure white
  surface:  '#FFFFFF',  // cards & art containers — art sits on neutral
  ink:      '#2D2A26',  // primary text — warm charcoal, never pure black
  muted:    '#6F6A63',  // secondary text
  line:     '#E9E2D8',  // borders, dividers — warm gray
  terra:    '#E8704A',  // primary accent (existing brand color)
  terraDark:'#C95A38',  // hover/active state
  terraSoft:'#FBEAE2',  // tinted backgrounds (badges, highlights)
  sage:     '#7C8B6F',  // success / verified (replaces generic green)
  sand:     '#F1E8DA',  // alternate section backgrounds
}
```
Rules: cream for page backgrounds, white for cards and anything holding
art imagery. Terracotta is an ACCENT — CTAs, active states, badges —
never large surfaces. Artist accent colors still personalize artist
profiles (their accent overrides terra on their own profile CTAs/tabs).

## Typography (next/font, both free Google Fonts)
- **Headlines: Fraunces** — warm, characterful serif with real
  personality. Use for h1–h3, hero text, artist names, section titles.
  Weights 500–700. This is the memorable, brandy voice.
- **Body/UI: DM Sans** — friendly geometric sans. Everything else.
- Interim wordmark: "Custom Canvas" set in Fraunces 600 — serves as the
  logo until a proper mark is designed (logo is a launch-checklist item,
  not a build task).

## Shape & depth
- Radius: rounded-xl on cards/inputs, rounded-full on buttons and pills.
  Generous rounding = friendly.
- Shadows: soft and warm — `shadow-[0_2px_12px_rgba(45,42,38,0.07)]` on
  cards, slightly deeper on hover. Never harsh black shadows.
- Borders: 1px `line` color; prefer borders + soft shadow over heavy
  shadow alone.

## Motion (subtle, everywhere, cheap)
- Feed cards: fade-in + 8px rise on scroll into view, staggered ~50ms.
- Card hover: translate-y(-2px) + shadow deepen, 200ms ease-out.
- Save heart: spring pop on toggle (scale 1 → 1.3 → 1).
- Buttons: 150ms color transitions, slight scale-down on press (0.98).
- Page content: gentle fade-in on route change (no slide gymnastics).
- Toasts: slide-up + fade. Modals: fade + scale from 0.97.
- Implementation: CSS transitions + Intersection Observer for scroll
  reveals; framer-motion ONLY if CSS can't do it. Transform/opacity
  only (60fps rule). Respect `prefers-reduced-motion: reduce` — all
  non-essential motion disables.

## Component restyle checklist (the Phase 1 pass)
- layout.tsx: load Fraunces + DM Sans via next/font, set cream body bg.
- tailwind.config: tokens above; map existing #E8704A usages to `terra`.
- Button/Badge/Modal/Toast/Input: radius, colors, motion per above.
- Navbar: cream/translucent with blur on scroll, ink text.
- Footer: sand background (not navy — navy retires from the app UI;
  it remains a pitch-deck color only).
- Empty states: warm copy (already specced) + simple line-art style
  icon accents in muted terra.

---

# PHASE 1 — INFRASTRUCTURE CONNECTION (make it real)

The app has never run against a real database. Everything else depends on this.

## 1.1 Supabase
- Create Supabase project `custom-canvas-staging` (a second project
  `custom-canvas-prod` is created later at launch).
- Run all 3 migrations against it: `npx supabase db push`.
- Run seed.sql (tags).
- Enable Realtime on: `messages`, `notifications`.
- Verify all 6 storage buckets created with correct policies:
  listing-images, banners, avatars, artist-photos, artist-videos, chat-attachments.
- Fill real values into `.env.local` and Vercel env vars.

## 1.2 Vercel
- Connect repo to Vercel. Deploy `master` branch to a staging URL.
- Configure env vars for the staging environment.
- Verify CI workflows pass on a real PR.

## 1.3 Stripe (test mode)
- Create Stripe account in test mode (LLC live account swaps in later —
  Phil is setting up the LLC + bank).
- Configure Stripe Connect (Express accounts).
- Register webhook endpoint: `https://<staging-url>/api/webhooks/stripe`
  Events: checkout.session.completed, account.updated,
  payment_intent.payment_failed, charge.refunded.
- Put webhook secret in env.

## 1.4 Resend + Sentry
- Resend: create account, verify sending domain (or use resend.dev for staging).
- Sentry: create project, add DSN to env, verify an error reports correctly.

## 1.5 Static assets
- Generate favicon.ico, icon-192.png, icon-512.png, apple-touch-icon.png
  in `/public` (brand: #E8704A on cream #FAF6F0). manifest.json already
  references them.

## 1.6 Design system pass ("Warm Houston Gallery")
- Implement the DESIGN DIRECTION section at the top of this document:
  tailwind.config tokens, Fraunces + DM Sans via next/font, cream
  backgrounds, component restyle checklist, motion utilities, and
  prefers-reduced-motion support.
- This pass restyles existing components once; every later phase builds
  with the new system automatically.

**Done when:** Staging URL loads with the warm design system applied
(cream background, Fraunces headlines, restyled buttons/cards with
hover motion), user can register, a row appears in Supabase, a test
Sentry error reports, CI green.

---

# PHASE 2 — REVENUE MODEL v3 (the money fix)

The build implements the OLD model (15% only). The correct model:
**15% artist commission + flat $10 buyer fee + artist-set shipping (passes through
to artist). Local pickup = no shipping charge.**

## 2.1 Migration 00004 — revenue fields
```sql
ALTER TABLE listings ADD COLUMN shipping_rate_cents INT DEFAULT 0;
-- 0/NULL with pickup fulfillment = local pickup only / free shipping

ALTER TABLE listings ADD COLUMN price_visible BOOLEAN DEFAULT TRUE;
ALTER TABLE listings ADD COLUMN sold_price_cents INT;
ALTER TABLE listings ADD COLUMN show_sold_price BOOLEAN DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN buyer_fee_cents INT NOT NULL DEFAULT 1000;
ALTER TABLE orders ADD COLUMN shipping_cents INT NOT NULL DEFAULT 0;
```

## 2.2 Rewrite `commissionCalc.ts`
```ts
export const PLATFORM_RATE = 0.15;
export const BUYER_FEE_CENTS = 1000; // flat $10

export function calcSplit(priceCents: number, shippingCents = 0) {
  const platformCommission = Math.round(priceCents * PLATFORM_RATE);
  const artistPayout = priceCents - platformCommission + shippingCents;
  const buyerTotal = priceCents + BUYER_FEE_CENTS + shippingCents;
  const platformRevenue = platformCommission + BUYER_FEE_CENTS;
  return { platformCommission, artistPayout, buyerTotal,
           platformRevenue, buyerFee: BUYER_FEE_CENTS, shippingCents };
}
// $300 + $20 shipping → buyer pays $330, artist gets $275, platform gets $55
```

## 2.3 Checkout flow update
- `/api/payments/checkout`: compute via calcSplit. Stripe Checkout Session
  line items: artwork price + "Service fee $10" + "Shipping $X" (omit shipping
  line if pickup). application_fee_amount = commission + buyer fee.
- Checkout page: order summary box — Price + Shipping + Service fee = Total.
  If listing fulfillment = pickup: "Local pickup — no shipping" and address
  form replaced by a pickup note ("You'll coordinate pickup with the artist
  via Messages after purchase").
- Webhook: write buyer_fee_cents + shipping_cents onto the order.

## 2.4 Stripe Tax (sales tax — REQUIRED)
Texas marketplace facilitator law makes the PLATFORM responsible for collecting
and remitting sales tax.
- Enable Stripe Tax on the platform account.
- Checkout Sessions: `automatic_tax: { enabled: true }`.
- Tax is added on top of buyer total and remitted by Stripe — artist payout
  is unaffected.

## 2.5 Listing form + display updates
- New Listing / Edit Listing: add Shipping step — "Shipping rate" dollar input,
  or auto-disabled showing "Local pickup only" when fulfillment pref = pickup.
- Add price controls: `price_visible` toggle ("Contact for price" when off),
  and on sold listings a "Show sold price" toggle + sold price input.
- PurchasePanel: show shipping rate (or "Local pickup — free"), disclose
  "$10 service fee at checkout", show estimated total.
- FeedCard + ListingDetail: render "Contact for price" when price_visible=false;
  render "Sold for $X" when show_sold_price=true.

## 2.6 Unit tests for money code (REQUIRED — only mandatory tests in plan)
- Vitest. Test calcSplit: normal sale, with shipping, zero shipping, rounding
  edge cases ($0.99, $333.33), pickup.
- Test webhook handler order-creation math with mocked Stripe events.

**Done when:** Test-mode purchase of a $300 listing with $20 shipping charges
buyer $330 (+tax), creates order with correct splits, Stripe dashboard shows
$55 application fee. All money tests green.

---

# PHASE 3 — ROBUST ARTIST PROFILE (the differentiator)

DB tables exist (artist_education, artist_personal_photos, artist_videos,
listing_series) but have NO UI. This phase builds the full experience.

## 3.1 Universal upload components (foundation for everything below)
- `ImageUpload` — drag-and-drop dropzone. Props: maxFiles, maxSizeMB, accept,
  onUpload. Flow: get signed URL from API → upload direct to Supabase Storage →
  return public URL. Progress bar per file. Mobile: tap to open camera/library.
- `VideoUpload` — same pattern. Max 200MB. Accept MP4/MOV/WebM. Upload progress
  with percentage (large files). On complete: client generates a thumbnail by
  seeking to 1s in a hidden <video> + canvas capture, uploads thumbnail too.

## 3.2 Avatar + banner upload (wire into profile edit)
- Avatar uploader in profile edit (circular crop preview, max 2MB).
- Banner uploader (1440x400 guidance, max 5MB).
- Same for gallery/partner profile edit.

## 3.3 Story section
- Migration 00005: `ALTER TABLE artist_profiles ADD COLUMN story TEXT;`
- Profile edit: large textarea, no character limit, prompt copy:
  "Tell your story. What drew you to art? What are you making right now?
  There are no rules here — this is your space."
- Public profile: "My Story" section, flowing prose, rendered above the portfolio.
  Artist statement becomes secondary/collapsible below it.

## 3.4 Pinned Work (up to 3)
- Migration 00005: `ALTER TABLE artist_profiles ADD COLUMN pinned_listing_ids UUID[];`
- API: `PATCH /api/artists/[slug]/pinned` — validates max 3 + ownership.
- Dashboard: `PinnedListingSelector` — grid of own listings with checkboxes (max 3).
- Public profile: `PinnedWork` — up to 3 large featured cards rendered above
  the portfolio grid. Hidden entirely if none pinned.

## 3.5 Series / Collections
- New page `/series` (artist): create/edit/delete series (name, description,
  optional cover image), drag to reorder.
- Listing form: "Series" select (optional, one series per listing).
- API routes: GET/POST `/api/artists/[slug]/series`, PATCH/DELETE
  `/api/artists/[slug]/series/[id]` (delete sets listings.series_id = null).
- Public profile portfolio: `SeriesTabs` — "All Work" first, then each series.
  Active tab uses artist accent color. Status filter (Available/Sold/All)
  within each tab.

## 3.6 Education & Training
- Profile edit: "Education & Training" fieldset. Repeatable entries:
  school_name (required), program, years_attended, description. Add/remove/
  drag-reorder. API: CRUD on `/api/artists/[slug]/education`.
- Public profile: timeline-style list.
- Partner auto-link: when an education entry's school_name matches a verified
  partner's name → set partner_id; render small verified shield + link on
  the public profile. (Full partner linking lands with Phase 4.)

## 3.7 Personal photos — "Meet the Artist"
- Profile edit: PersonalPhotoUploader — up to 10 photos, caption per photo,
  drag to reorder. Bucket: artist-photos.
- Public profile: "Meet the Artist" — first photo hero-sized, rest in
  horizontal scroll (mobile) / grid (desktop). Captions on hover/tap.

## 3.8 Videos (direct upload)
- Profile edit: VideoUploader — up to 5 videos, max 200MB each, title +
  description per video, reorder. Bucket: artist-videos.
- Public profile: VideoGallery in "Meet the Artist" — native <video> players
  with poster thumbnails, playsInline for iOS, inline playback, full-screen
  on tap. Lazy-load: do not load video bytes until poster is tapped
  (preload="none").
- Note in code comments: transcoding deferred — if format issues arise
  post-launch, add Mux/Cloudflare Stream.

## 3.9 Customisation completion
- Accent color picker: 16-swatch curated palette in profile edit.
- Bio layout selector: left / center / minimal with mini visual previews.
- Apply accent color to: profile CTAs, series tab active state, commission
  panel header, badges.

## 3.10 Profile preview mode
- "Preview as visitor" button in profile edit → opens public profile in new
  tab with a dismissible "This is how buyers see your profile" banner.

## 3.11 Completeness score update
Rebalance to include new fields:
display_name 10, story 15 (min 100 chars), primary_mediums 5*, neighborhood 5,
fulfillment_pref 10, avatar 10, banner 5, has_listings 20, stripe_onboarded 10,
has_education 5, has_personal_photo 5.
(*Add `primary_mediums TEXT[]` to artist_profiles in migration 00005 with a
multi-select chips input in profile edit; display as tag row in ProfileHero.)
Statement, influences, videos, series = bonus, never blocking.

**Done when:** A test artist can build a complete profile with story, 3 pinned
works, a series with tabbed portfolio, education entries, 10 photos, 2 videos
playing inline on mobile, custom accent color — and preview it as a visitor.

---

# PHASE 4 — PARTNER SYSTEM (Gallery → 8 types)

Keep everything gallery-related working; expand it.

## 4.1 Migration 00006
```sql
CREATE TYPE partner_type_enum AS ENUM ('gallery','museum','school','business',
  'interior_design','artist_residency','corporate','community_org');
ALTER TABLE gallery_profiles ADD COLUMN partner_type partner_type_enum
  NOT NULL DEFAULT 'gallery';
ALTER TABLE artist_education ADD COLUMN partner_id UUID
  REFERENCES gallery_profiles(id) ON DELETE SET NULL;
```
Keep the table name `gallery_profiles` (avoid a risky rename); introduce
"Partner" as the product-facing term in all UI copy and types
(`PartnerType`, `PartnerProfile` aliases).

## 4.2 Badge system
- `PartnerBadge` component: green shield + type-specific label
  ("Verified Gallery", "Verified School", "Verified Museum", "Verified
  Business", "Verified Design Firm", "Verified Residency", "Verified
  Corporate", "Verified Organization").
- Render locations: partner profile, partner dashboard, every chat message
  bubble from a verified partner (shield only + tooltip), chat thread header,
  commission request header/email, artist education entries (linked).

## 4.3 Onboarding + directory updates
- /onboarding/gallery → add "What type of organization are you?" select
  (sets partner_type). Rename route group copy to "Partner".
- /galleries directory → /partners (301 redirect from /galleries). Filter
  by partner type.
- Admin verification queue: show partner type, same approve/reject flow.

## 4.4 Affiliated artists (two sources, merged)
On the partner profile, show one "Artists" section combining:
1. gallery_artists relationships (represented/featured/alumni — already built)
2. artist_education entries linking to this partner (auto: "Alumni & Students")
Background job (or on-verify hook): match existing education school_name
against newly verified partner names and set partner_id.

**Done when:** A school registers as Partner type "school", gets verified,
its badge shows in chat, and a student linking it in education appears in
the school's Artists section.

---

# PHASE 5 — DISCOVERY & SEARCH

## 5.1 Wire the search bar
- Navbar search → routes to `/?q=<term>` (feed with query applied).
- /api/feed: extend with full-text search across listing title/medium/
  description + artist display_name/bio (Postgres tsvector — add
  search_vector columns + GIN indexes + triggers in migration 00005 if the
  original migration lacks them).
- Autocomplete dropdown: top 3 artists + top 3 listings as you type
  (debounced 300ms).

## 5.2 Complete the filter set
Existing: search, mediums, price range. Add: Houston neighborhood
(multi-select), art school (multi-select), commissions open (toggle),
availability (Available Now / Commission Only), sort (Newest, Price ↑,
Price ↓, Most Saved). All filters in URL params (shareable). Mobile
FilterDrawer parity.

## 5.3 Browse Artists view
- Feed toggle: [Art | Artists]. Artists view = grid of ArtistCards
  (banner, avatar, name, school, neighborhood, mini 3-thumb strip,
  follow button).

**Done when:** Searching "watercolor Montrose" from the navbar returns
correct filtered results with the URL reflecting state.

---

# PHASE 6 — CHAT & COMMISSION UPGRADES

The chat works; these are the differentiators from the spec.

## 6.1 Context-anchored threads
- `ContextBanner` pinned at top of thread: listing thumbnail + title +
  price (listing context) or commission status (commission context).
- Conversations already store context — render it.

## 6.2 Smart conversation starters
- "Message Artist" from a listing → opens/creates the conversation with
  body pre-filled: "Hi, I'm interested in [Title] — $X. Is this still
  available?" and the listing auto-attached as a listing card message.

## 6.3 Rich messages in chat
- Listing card message type: artist can share own listings via the (+)
  attach menu; card renders thumbnail/title/price + View/Buy buttons.
- File attachments: wire the existing chat-attachment storage into the
  attach menu (images + PDFs, max 10MB). Image lightbox on tap.
- Quote card IN chat: when an artist sends a commission quote, post a
  QuoteCard message into the linked conversation with Accept/Decline
  inline (drives the same commission status transitions as the
  commission detail page).

## 6.4 Chat safety
- Block user: thread menu → Block. Migration 00006:
  `blocked_users (blocker_id, blocked_id, created_at, PK both)`.
  Blocked users cannot message you; their threads hide. Blocked party is
  NOT notified — their messages simply never deliver.
- Mute conversation: thread menu → Mute. Migration 00006:
  `muted_conversations (profile_id, conversation_id, PK both)`.
  Muted threads: no notifications (in-app or email), no unread badge
  contribution, thread stays in inbox with a small mute icon. Other
  party never knows.
- Report message: long-press/hover menu → report (reuses reports system).
- Report user: thread menu → Report user (profile report with
  conversation context attached for admin review).

**Done when:** Buyer taps Message on a listing, lands in a pre-filled
thread with the piece pinned; artist replies with a quote card; buyer
accepts in-thread; artist posts a WIP photo update and the buyer sees
it on their commission timeline with a notification.

## 6.5 Commission Progress Updates (kill the "any update?" message)
The deposit_paid phase is a weeks-long black box for buyers — the #1
cause of artists getting pestered. Give artists a 30-second way to show
progress instead.
- Migration 00006: `commission_updates (id, commission_id, artist_id,
  note TEXT, photo_url TEXT, progress_percent INT NULL CHECK 0-100,
  created_at)`.
- Artist side (commission detail page, visible from deposit_paid
  onward): "Post an update" — short note (required), optional WIP photo
  (ImageUpload), optional progress slider (0–100%).
- Buyer side: progress timeline on the commission detail page (newest
  first, photos open in lightbox) + overall progress bar when
  percentages are posted. In-app notification + email per update:
  "[Artist] posted an update on your commission."
- Stale-commission nudge: daily cron — commissions in deposit_paid with
  no update for 14+ days → gentle email to artist: "Buyers love
  progress updates. Post one for [Buyer]'s commission?" Max one nudge
  per 14 days per commission.
- Updates are append-only (no edit/delete) — they double as the work
  record if a dispute ever arises.

---

# PHASE 7 — BUYER EXPERIENCE & OPERATIONS

## 7.1 Order lifecycle completion
- Buyer cancel: allowed only while status = awaiting_shipment. Triggers
  full Stripe refund (incl. buyer fee + shipping + tax via Stripe),
  listing returns to available, both parties emailed.
- Admin refund: in dispute resolution — full or partial refund via
  Stripe API with reason note.
- Local pickup flow: pickup orders skip address; confirmation screen +
  email say "Coordinate pickup with [Artist] via Messages" with a deep
  link; auto system message posts into the thread: "Order #X is ready
  to coordinate pickup."

## 7.2 Review reminder cron
- `vercel.json` cron → `/api/cron/review-reminders` daily: finds orders
  delivered 7+ days ago without review + not yet reminded
  (review_requested_at null), sends ReviewRequest email, stamps
  review_requested_at. Protect route with CRON_SECRET.

## 7.3 Email compliance + preferences
- Add unsubscribe link to all non-transactional emails (CAN-SPAM).
- Migration 00006: `email_preferences` JSONB on profiles
  (marketing, new_listing_alerts, message_notifications — purchase/
  payout emails always send).
- /account: "Email Preferences" section with toggles. Unsubscribe link
  lands on a one-click page.

## 7.4 Follower notifications
- On listing publish: notify followers (in-app) + email those opted in
  to new_listing_alerts. Batch: max one email per artist per hour
  (track last_alert_sent_at on follows or a simple debounce table).

## 7.5 Registration compliance
- Terms acceptance checkbox at registration (required):
  "I agree to the Terms of Service and Privacy Policy" with links.
  Store accepted_terms_at timestamp on profiles.

## 7.6 Listing drafts
- listings.status add 'draft'. "Save draft" on the listing form. Drafts
  visible only to the artist with a Draft badge; publish flips to available.

## 7.7 Sharing
- Share button on listing + artist pages: native share sheet (mobile) /
  copy link (desktop).
- Dynamic OG images via @vercel/og: listing pages render cover image +
  title + price + artist; artist pages render banner + name + "Houston
  Artist on Custom Canvas".

## 7.8 Artist Away Mode ("shop temporarily closed")
- Migration 00006: `away_mode BOOLEAN DEFAULT FALSE`, `away_message TEXT`,
  `away_until DATE` on artist_profiles.
- Dashboard toggle: "Set my shop to away" with optional return date +
  custom message ("Back from Spring Break April 2!").
- While away: listings remain VISIBLE (discovery/SEO preserved) but Buy
  Now is disabled with banner "This artist is away — back [date]. Save
  this piece to revisit later." Save + Follow stay active.
- Commissions auto-set to closed while away (restored to previous state
  when away mode ends).
- Chat: optional auto-reply — first inbound message in a thread while
  away gets one automatic system reply with the away message (once per
  thread, not per message).
- Profile shows a subtle "Away — back [date]" pill in the hero.
- If away_until passes, away mode auto-disables (checked in the daily cron).

## 7.9 Recently Viewed (buyer)
- Track last 12 viewed listings per logged-in user (reuse analytics_events
  view tracking; query latest distinct listing views).
- "Recently Viewed" horizontal strip on the home feed for logged-in users
  with history. Guests: skip (no tracking without account).

## 7.10 Price-drop alerts for saved listings
- On listing PATCH where price_cents decreases: notify all users who
  saved it — in-app notification "Price drop: [Title] is now $X (was $Y)"
  + email to those opted into price_drop_alerts (add to email_preferences).
- Debounce: max one price-drop alert per listing per 24h (prevents
  artists gaming it by toggling).

## 7.11 Seamless mid-checkout registration
- Guest taps Buy Now → redirected to /register?returnUrl=/checkout/[id].
- After registration (or login), land directly back in checkout for that
  listing. Verify the existing returnUrl middleware handles register (not
  just login); fix if needed. Same for Save/Follow/Message guest taps:
  preserve intent and complete the action after auth where practical
  (at minimum return to the same page).

**Done when:** Full lifecycle works end-to-end in staging: purchase →
cancel/refund; pickup order coordinates via chat; review reminder fires
from cron; follower gets a (single) new-listing email; artist enables
away mode and Buy Now disables with the away banner; a saved listing's
price drop triggers a notification; a guest completes registration
mid-checkout and lands back in checkout.

---

# PHASE 8 — TRUST, SAFETY & COMPLIANCE

## 8.1 Rate limiting
Middleware (Upstash Ratelimit + Vercel KV, or in-memory fallback for
staging): messages 60/min, listings 10/min, commissions 5/min, reports
5/min, reviews 5/min, payments 10/min, feed 120/min, default 60/min.
429 with friendly message.

## 8.2 Cookie consent
Lightweight bottom banner, first visit: "We use cookies to improve your
experience." Accept + Learn More (→ /privacy). localStorage flag.

## 8.3 Houston Verified flow
- Artist dashboard card: "Get Houston Verified" → simple form (how are
  you connected to Houston — school/neighborhood/studio + optional links).
- Creates a verification_request row (migration 00006). Admin queue tab
  approves → is_houston_verified = true + notification + email.

## 8.4 Security pass
- Verify every write route: Zod validation + auth + ownership (audit
  checklist, fix gaps).
- Stripe webhook signature verification confirmed.
- Security headers in vercel.json (X-Frame-Options DENY, nosniff,
  Referrer-Policy strict-origin-when-cross-origin).
- Confirm RLS denies cross-user reads on conversations, orders,
  notifications with a manual test.

**Done when:** Rate limits return 429 under burst, cookie banner shows
once, an artist can request and receive Houston Verified, security
audit checklist complete.

---

# PHASE 9 — QUALITY, TESTING & LAUNCH PREP

## 9.1 Tests (beyond money tests from Phase 2)
- Playwright E2E on the 5 critical paths: register→onboard→profile live;
  create listing with images; purchase (Stripe test card) → order created;
  commission request→quote→accept→deposit; send/receive message realtime.
- Run E2E in CI against preview deploys.

## 9.2 Accessibility + mobile QA
- Keyboard nav on Modal, ImageCarousel, menus. Focus-visible everywhere.
  Alt text enforced on listing image upload (required field).
- Full pass of every page at 375px width. Fix overflow/tap-target issues.

## 9.3 Onboarding email drips
- Artist drip (stops when profile goes live): Day 1 "Your profile is
  waiting" / Day 3 "Houston is waiting to see your work" (+ missing-items
  checklist) / Day 7 final nudge. Daily cron checks cohorts.
- Buyer drip: Day 1 "Meet some of Houston's artists" (3 featured) if no
  save/follow/purchase yet.

## 9.4 Launch checklist artifacts
- LAUNCH.md in repo: prod Supabase project + migration steps, prod Stripe
  (live keys — after Phil's LLC + bank), domain DNS (getcustomcanvas.com),
  Resend domain verification, Sentry prod env, smoke-test script.

**Done when:** All E2E green in CI, mobile QA punch list empty, drips
firing in staging, LAUNCH.md complete.

---

# BUILD ORDER SUMMARY

| Phase | Theme | Depends on |
|-------|-------|-----------|
| 1 | Infrastructure connection | — |
| 2 | Revenue model v3 + Stripe Tax + money tests | 1 |
| 3 | Robust artist profile (uploads, story, pins, series, photos, VIDEOS) | 1 |
| 4 | Partner system (8 types) | 1 |
| 5 | Discovery & search | 1 |
| 6 | Chat & commission upgrades | 1 |
| 7 | Buyer experience & operations | 2 |
| 8 | Trust, safety & compliance | 1 |
| 9 | Quality, testing & launch prep | 2–8 |

Phases 3–6 and 8 can be built in any order after Phase 1 (Phase 2 first
is strongly recommended — it's revenue). Phase 7 needs Phase 2. Phase 9
is last.

---

# NEW MIGRATIONS SUMMARY
- 00004: shipping_rate_cents, price_visible, sold_price_cents,
  show_sold_price (listings); buyer_fee_cents, shipping_cents (orders)
- 00005: story, pinned_listing_ids, primary_mediums (artist_profiles);
  search_vector columns + triggers if missing; listings.status 'draft'
- 00006: partner_type enum + column; artist_education.partner_id;
  blocked_users; muted_conversations; commission_updates;
  email_preferences (incl. price_drop_alerts); verification_requests;
  profiles.accepted_terms_at; away_mode + away_message + away_until
  (artist_profiles)

# NEW ENV VARS
CRON_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (rate
limiting), STRIPE_TAX enabled flag (config, not secret)

---

# BACKLOG (post-launch — do NOT build now)
Captured so good ideas don't get lost or scope-creep the launch:
- Commission slots counter ("2 slots open") — scarcity driver
- "View in a room" size visualization on listing pages
- Buyer collections/boards for organizing saved art
- "Similar style" recommendations beyond same-artist
- Weekly "This week in Houston art" digest email
- Saved searches with alerts ("notify me of new watercolor under $300")
- Artist quick-replies / saved responses in chat
- Video transcoding (Mux/Cloudflare Stream) if format issues arise
- Social login (Google OAuth)
- Gift purchase flow (gift note + recipient address)
