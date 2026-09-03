# Legal Alignment Plan — making the product match the final documents

*Written 2026-09-03, on receipt of the counsel-reviewed set in
`docs/legal/website legal documents/` (eight documents; Terms of Service, Terms
of Sale, Artist Agreement and Privacy Policy at v2.0, Seller Protection,
Listing Standards, Shipping/Returns/Refunds and DMCA at v1.0; all effective
2026-09-03). This is the last build arc before final testing and go-live. It
follows the `docs/REVIEW-FIX-PLAN.md` conventions: phases with Why / Do /
Accept, rulings with defaults, one migration number per phase, executable cold
in fresh sessions.*

**What this plan is.** Every one of the eight documents was read in full against
the code as it stands after the review arc (master `f84203b`). Every promise
the documents make about how the product behaves was checked. What came out
sorts into three buckets:

- **Documents that are wrong about the product** (two passages, one processor
  omission, and the DMCA agent placeholders). These go back to counsel with the
  DMCA tweak, today. Section A.
- **Product that must change to match the documents.** Twelve phases, L1–L12,
  sized S/M/L. Section C.
- **Already true**, recorded so nobody re-checks it. Section B.

Then final testing and the go-live sequence, Section D, and the traceability
table, Section E.

**Ground rules for the implementing sessions** are the review arc's: worktree
off `master`, branch per phase, `docs/CONVENTIONS.md` is the standard, every DB
change ships with `scripts/db-smoke.sql` expectations, verification bar is
`tsc --noEmit` + `next lint` + `vitest run` + `db-smoke` + the phase's Accept,
migrations applied by hand with psql to DEV first and to prod only in Section
D. Next migration number is **00058**. Money-touching phases (L5–L8) get a
headless money review pass before the go-live gate, exactly as R12 did.

---

## A. Send back to counsel (with the DMCA tweak)

These are places where the documents describe a product that does not exist,
or omit something the product does. Fix the text, not the code.

| # | Document and place | What it says | What is true | Suggested fix |
|---|---|---|---|---|
| A1 | Artist Agreement §4, paragraph "Local pickup is not currently eligible for protection"; Seller Protection, "Local pickup is not eligible today" | The pickup-confirmation feature "is not yet built" and pickup orders "currently evaluate as unprotected" | The two-sided pickup handoff **exists, is tested, and works**: buyer and artist each confirm from their own order card, the order becomes delivered on the second confirmation, and protection attaches. It has an end-to-end test that asserts exactly that. | Replace both passages with: pickup orders are Protected when both parties confirm the handoff through the Platform's pickup-confirmation process; an order confirmed by only one party is not delivered and not Protected. |
| A2 | Terms of Sale §3 "Local pickup", Shipping §"Local pickup" | "use any pickup-confirmation process provided by the Platform"; "or, until that feature is available, a clear written confirmation in Messages" | The process is provided. | Drop the hedges; the written-confirmation fallback can stay as advice. |
| A3 | Privacy Policy §3 processor table | Lists Supabase, Stripe, Resend, Vercel, Sentry, Turnstile, BigDataCloud, zippopotam.us | The rate limiter also sends the requester's **IP address to Upstash** (Redis) when `UPSTASH_REDIS_REST_URL` is set in production. | Add a row: **Upstash** · Rate limiting · IP address and request path. |
| A4 | DMCA & Copyright Policy, "Designated DMCA Agent" | `[NAME OR POSITION]`, `[TELEPHONE NUMBER]`, `[DEDICATED DMCA EMAIL]` | Placeholders. | Fill in (the tweak already in hand). See L11 for the registration and mailbox that must exist before the page goes live. |

Nothing else in the set contradicts the product. In particular: the documents
correctly say delivery confirmation is the artist's attestation today (ruling
D1 stands, and the documents now carry the disclosure), that commissions are
arranged and paid off-platform, that the charge appears as CUSTOM CANVAS, that
the 5-business-day window is shown on every listing, and that reviews are one
per delivered order.

---

## B. Already true (for the record)

Checked against the code; no work.

- Artist is charged 15% of price and receives 85% + 100% of shipping; the
  $1,000/$40 example in Artist Agreement §2 reproduces ($890). Stripe Express,
  14-day payout delay, transfers-only.
- Six protection requirements: 5-business-day window, tracking from
  USPS/UPS/FedEx/DHL before marking shipped (all four are in the Ship modal),
  delivery recorded before the dispute (attestation, frozen server-side),
  requirement 5 frozen at sale (photo count + 150-char description snapshot),
  3-business-day reply window measured from the message history at dispute
  time. Studio › Sales shows standing before any dispute, split into fixable
  and frozen. The dispute notification's first sentence states whether the
  order was Protected.
- Pickup handoff: two-sided confirmation with protection on both-confirm (A1
  is the documents catching up to this).
- AI disclosure: radio + required explanation on create and edit, schema and
  DB-enforced.
- Reviews: one per delivered order, RLS-enforced. Block, report from the item,
  private messaging, email restricted at the database level, unsubscribe
  links, cookie banner and local-storage community, cookieless Vercel
  analytics, Turnstile on sign-up/sign-in.
- Refund request from Orders opens a thread pre-filled with the order number.
  "Ships within 5 business days" is on the listing's purchase panel.
- Account deletion detaches the person from completed sales and keeps the
  money record (Privacy §6 "How deletion interacts with records we must keep"
  describes what the review arc built).
- Artist Agreement acceptance is versioned, click-wrapped at onboarding,
  stamped and frozen, re-verified at submit.

---

## Rulings needed (defaults apply if none arrive)

| # | Question | Default | Phase |
|---|---|---|---|
| D7 | Ruling D6 waived signature confirmation because nothing could record it. The final documents require it (Seller Protection req. 4, Artist Agreement §4/§7, Terms of Sale §3, Shipping). Restore the requirement with an admin recording path? | **Yes.** Supersede D6. Requirement 4 active; an admin records signature confirmation from the carrier's record at dispute time. | L5 |
| D8 | Listing Standards require nudity/mature work to be "tagged so it can be filtered". Hide-by-default with an opt-in, or blur only? | **Hide by default.** A `mature` flag; excluded from the public feed, home shelves and search unless the viewer turns on "Show mature work" (stored in the browser); the listing page shows a click-through notice. | L4 |
| D9 | Returns need a return address. Where does it come from? | The **artist supplies it** when approving a change-of-mind refund or when Custom Canvas authorises a fault return; stored on the return record; shown to the buyer only after authorisation. Never the artist's public profile. | L8 |
| D10 | Return shipping cost: does the platform buy labels or is "who pays" informational? | **Informational at launch**, exactly as the documents word it ("ordinarily bears"). No label purchase. | L8 |
| D11 | Existing accounts accepted nothing (buyers) or v1.0 (artists). Terms of Service v2.0 adds arbitration and a class waiver — material under §17. How is acceptance obtained from existing users? | **Blocking interstitial** on the next signed-in visit for every existing account: accept ToS v2.0 (+ Terms of Sale for buyers, Artist Agreement v2.0 + Seller Protection for artists) before any purchase, listing, message or review. Browsing stays open. | L2 |
| D12 | Terms of Service §2: 18+. Add an age attestation at registration? | **Yes**, as part of the acceptance checkbox text ("I am 18 or older and agree to…"). No date-of-birth collection. | L2 |
| D13 | Return flow at launch: full buyer-facing flow (tracking entry, status) or admin-run minimum? | **Admin-run minimum for launch, full flow before the public push.** L8 defines both. | L8 |

---

## C. Phases

Sizing: S = a session or less, M = one to two sessions, L = three or more.
Order matters where noted; L1–L3 first because the documents are effective
today and the checkout link is wrong today.

### L1 — Publish all eight documents from source (M) — first

**Why.** Only Terms of Service, Privacy and the Artist Agreement have pages, all
three hand-transcribed and now out of date; five documents have no page at
all; the checkout's "Terms of Sale" link points at the Terms of Service. The
documents are effective today.

**Do.**
1. Add `react-markdown` + `remark-gfm` (the documents use tables). One
   server component `LegalDocument` reads
   `docs/legal/website legal documents/markdown/<slug>.md` at build time and
   renders it with the site's typography (prose styles: headings, tables with
   `overflow-x: auto`, blockquotes for the requirement lists). The markdown in
   the repo **is** the page; no transcription.
2. Routes: `/terms` (Terms of Service), `/terms-of-sale`, `/privacy`,
   `/shipping-returns`, `/dmca`, `/seller-protection`, `/listing-standards`,
   `/artist-agreement` (keep `noindex`; keep the version banner, now reading
   the version from the document header). Each page: title, "Version X ·
   Effective date" line parsed from the document, and a "See also" row.
3. Footer: About · Partners · Terms · Terms of Sale · Shipping & Returns ·
   Privacy · DMCA. Seller Protection and Listing Standards are linked
   contextually (L9) and from the Artist Agreement page.
4. `src/app/checkout/[listingId]/page.tsx`: both "Terms of Sale" links →
   `/terms-of-sale`. The notice text above Pay becomes the "summary displayed
   above the Pay button" Terms of Sale §1 promises: seller is the artist,
   charge appears as CUSTOM CANVAS, artist-mediated refunds, service fee
   non-refundable on change of mind, refunded on fault.
5. `/dmca` ships only when A4 is filled in; until then the route returns the
   page with the agent block replaced by "designated agent details are being
   registered; write to support@customcanvas.shop" — and L11 removes that.
6. Delete the three hand-written JSX bodies. Update `robots.ts` and the
   sitemap's static list to include the new public pages.

**Accept.** Every one of the eight URLs renders the repo markdown (diff a
rendered page's text against the source: no divergence). Footer shows the new
links. Checkout's Terms of Sale link opens the Terms of Sale. `visitor.spec.ts`
extended to visit all eight pages and assert the version line.

### L2 — Acceptance and versioning (M) — with L1

**Why.** ToS §1 ("checking an acceptance box"), §17 (affirmative acceptance for
material changes), Terms of Sale ("you accept them at checkout"), Artist
Agreement §12, Seller Protection ("versioned with it"). Today only the Artist
Agreement is versioned and recorded, and it records v1.0.

**Do.**
1. `src/lib/agreement.ts`: `ARTIST_AGREEMENT_VERSION = '2.0'`,
   `SELLER_PROTECTION_VERSION = '1.0'` recorded alongside it; rewrite
   `AGREEMENT_SUMMARY` to v2.0's load-bearing points (seller of record;
   15/85; 14-day payout; six protection requirements incl. signature at $750;
   5-business-day window and the buyer's cancel right if missed; risk of loss
   until delivery; shipping coverage; artist-mediated refunds with the four
   exceptions and fee refunded on fault; returns may be required).
2. Add `TERMS_VERSION = '2.0'` and `TERMS_OF_SALE_VERSION = '2.0'`. Migration
   **00058**: `profiles.terms_version TEXT`, `profiles.terms_accepted_at
   TIMESTAMPTZ`, `profiles.terms_of_sale_version TEXT`,
   `profiles.terms_of_sale_accepted_at TIMESTAMPTZ`, frozen for
   non-privileged UPDATE except through the acceptance route; a
   `POST /api/account/accept-terms` route (cookie client → user, service role
   write) stamps them.
3. Registration: the existing checkbox text becomes "I am 18 or older and
   agree to the Terms of Service and Privacy Policy" (D12); on success the
   route stamps `terms_version`/`terms_accepted_at`.
4. Checkout: acceptance of the Terms of Sale is recorded at first purchase
   (stamp `terms_of_sale_*` from the checkout route if unset; the notice above
   Pay is the disclosure).
5. Re-acceptance interstitial (D11): a layout-level client gate for signed-in
   users whose recorded versions differ from the current constants. Shows the
   relevant documents' summaries and a single checkbox; blocks
   checkout, listing create/edit, message send, review submit and commission
   actions until accepted; browsing, Orders and Studio reading stay open.
   Artists whose `agreement_version` is stale also re-accept the Artist
   Agreement + Seller Protection here (the submit-for-review gate keeps its
   existing check).
6. `db-smoke.sql`: column set, freeze matrix rows.

**Accept.** A new registration stamps v2.0. The one existing live artist and
the admin see the interstitial once; after accepting, `agreement_version =
'2.0'` and `terms_version = '2.0'` on their rows. A buyer with stale terms is
blocked from Pay but can browse. e2e: registration spec asserts the stamp;
a new `acceptance.spec.ts` drives the interstitial with a seeded stale user.

### L3 — Seller-of-record surfaces (S) — with L1

**Why.** Terms of Sale §1, ToS §4, Artist Agreement §1: the artist is the
seller; "the artist identified in the applicable listing" must identify
someone, and the buyer must see it before, at, and after purchase. Today
the listing page shows the artist's name as authorship, never as seller; the
checkout and the confirmation email do not say who sold the piece.

**Do.**
1. Listing page purchase panel: "Sold by {display_name} · Custom Canvas
   facilitates payment" under the price.
2. Checkout summary: a "Seller" row naming the artist above the line items;
   the notice above Pay (L1.4) states the arrangement.
3. Order confirmation email and the buyer's Orders page: "Sold by
   {artist}"; New-sale email unchanged. Receipt = the confirmation email
   (the documents don't promise a separate receipt).
4. Statement descriptor stays CUSTOM CANVAS (already disclosed).

**Accept.** Screenshots of listing, checkout, Orders, and the confirmation
email each show the artist named as seller; `purchase-refund.spec.ts` asserts
the checkout Seller row.

### L4 — Listing Standards fields and the mature flag (M)

**Why.** Listing Standards Part one: every listing must state what it is
(original / numbered edition / open edition / reproduction), medium, dimensions
(+ depth where relevant), year, **condition**, and edition details; a print or
reproduction must say so in the title or first line. Part three: mature work
must be taggable and filterable (D8). Today the listing has medium,
dimensions, year, description, AI disclosure — no edition type, no condition,
no mature flag.

**Do.**
1. Migration **00059**: `listings.edition_type TEXT NOT NULL DEFAULT
   'original' CHECK IN ('original','limited_edition','open_edition',
   'reproduction')`, `edition_size INT`, `edition_number INT`, `is_signed
   BOOLEAN`, `condition_notes TEXT`, `is_mature BOOLEAN NOT NULL DEFAULT
   false`, `handling_notes TEXT` (the "where applicable" hazard/mounting
   disclosures). Existing rows default to original/unsigned; a note in the
   migration says the two prod listings and DEV rows were reviewed.
2. Schema + both forms: edition type select (required); edition size + number
   required when limited; signed checkbox; condition textarea **required**
   for new listings (min 10 chars; "New, no damage" is fine); handling notes
   optional; mature checkbox with the standards' wording. Reproduction rule:
   when edition_type is open_edition/reproduction the title must contain
   "print" or "reproduction" (zod message quotes the standard) and the
   listing page shows the edition type as its first line.
3. Listing page: an "About this piece" block — edition type, edition details,
   condition, handling notes, AI disclosure — above the description.
4. Feed, shelves, search, artist page grids: exclude `is_mature` unless the
   viewer's "Show mature work" preference is on (LocationContext-style local
   storage, a toggle in the feed filters and on the account page); listing
   page for a mature piece shows a click-through notice before the images
   render. Sitemap includes mature listings (the notice is on-page).
5. RLS/grants: new columns are client-readable like the rest of `listings`;
   the guard on `listings` needs no change (artist-owned columns).

**Accept.** A reproduction titled without the word is refused with the
standard quoted; a mature listing is absent from an anonymous home feed and
present with the toggle on; the listing page shows condition and edition
details; `artist-shop.spec.ts` extended for the new required fields;
db-smoke pins the CHECK.

### L5 — Signature confirmation: restore requirement 4 with a recording path (S) — D7

**Why.** Every document requires signature confirmation on $750+ orders and
lists it as protection requirement 4. D6 waived it because nothing could
record it. The legal drafts were right; the code lacked a writer.

**Do.**
1. `POST /api/admin/orders/[id]/signature-confirmed` (admin only, service
   role, compare-and-swap on `signature_required = true AND
   signature_confirmed = false`, stamps `signature_confirmed_at` — add the
   column in migration **00060**, frozen for non-privileged) with a control on
   the admin orders page: "Record signature confirmation (checked carrier
   record)". Runbook step under chargebacks: for a $750+ order, open the
   carrier's tracking page, confirm a signature event exists, record it
   before responding to the dispute.
2. `evaluateProtection.ts`: `SIGNATURE_CONFIRMATION_AVAILABLE = true`; the
   requirement-4 failure text: "Signature confirmation on orders of $750 or
   more — Custom Canvas records it from the carrier's record; make sure you
   bought it." Ship modal wording back to "required" (Artist Agreement §7);
   badge lists it as fixable-until-dispute.
3. `assessProtection` at dispute time: if `signature_required` and not yet
   recorded, the freeze notification tells the admin to check the carrier
   record before the response deadline (the assessment is frozen once; so
   the closed handler's "assess before reversing" path from R13 must re-read
   `signature_confirmed` — verify it does).
4. DECISIONS.md: D7 entry superseding D6.

**Accept.** Unit: $1,200 order with signature recorded → protected; without →
ineligible naming requirement 4. Admin route smoke: non-admin 403, CAS
refuses a second record. db-smoke freeze row.

### L6 — Refund reasons and the service-fee rule (S–M)

**Why.** Terms of Sale §2/§5, Shipping §Refunds, Artist Agreement §8: on a
change-of-mind refund the fee and its tax are retained; on a fault refund
(never shipped, lost in transit, damaged, materially misdescribed, platform
error) **the fee is refunded**. `calculateRefundSplit` retains the fee always
and the settle route has no notion of reason.

**Do.**
1. Migration **00061**: `orders.refund_reason TEXT CHECK IN
   ('change_of_mind','not_shipped','lost_in_transit','damaged',
   'not_as_described','platform_error','artist_cancelled')`, frozen for
   non-privileged; `orders.refund_initiated_by TEXT CHECK IN
   ('artist','buyer','platform')`.
2. `approve-refund` (artist) writes `change_of_mind` / `artist`. Admin settle
   gets a reason picker; a fault reason is required to settle without an
   artist approval (`refund_approved_at IS NULL` is allowed only with a fault
   reason — this is the "we refund whether or not the artist agrees" path).
3. `calculateRefundSplit(order, reason)`: fault → refund price + shipping +
   fee + all tax (the whole charge); change of mind → today's split. Stripe
   call amount follows. Unit tests for both, plus the DECISIONS examples.
4. Admin orders page shows the reason; buyer's Orders page shows "Refunded
   (change of mind — service fee retained)" or "Refunded in full".
5. DECISIONS.md: the 2026-07-06 "service fee non-refundable" entry gets a
   dated amendment: non-refundable on change of mind only.

**Accept.** Unit: fault refund of a $200 + $20 shipping + $7 fee + tax order
returns the full charge; change of mind returns price + shipping + their tax.
Settle route refuses a change-of-mind settle without artist approval and
accepts a fault settle without it. `purchase-refund.spec.ts` extended with
an admin fault refund.

### L7 — Non-delivery, cancellation and abandonment (M) — after L6

**Why.** Terms of Sale §3/§7, Shipping §"If your piece is never shipped",
Artist Agreement §7/§8: if the window is missed the artist offers a new date
or cancellation; the buyer may cancel for a full refund without artist
approval; if the artist is unreachable for five business days after we ask,
we cancel and refund; the artist may cancel before shipping. Today the
buyer's only action is Request a refund (a message), and nothing runs when a
window passes.

**Do.**
1. Studio › Sales, on a `paid` order: **"Can't ship in time"** action →
   modal with a proposed new ship-by date + note; writes
   `orders.proposed_ship_by` (migration **00062**, with `window_missed_at`,
   `platform_nudged_at`), posts a system message in the thread ("The artist
   has proposed shipping by {date}. You can accept, or cancel for a full
   refund."), notifies + emails the buyer. **"Cancel order"** action before
   shipping → full refund (reason `artist_cancelled`, fee refunded), listing
   relisted, buyer notified.
2. Buyer's Orders page, on a `paid` order whose window has passed (created +
   5 business days) or with a proposed date: **"Accept new date"** (stamps
   `fulfillment_window_days` extension — the protection window is not
   extended; the Artist Agreement ties requirement 1 to the original 5 days,
   say so in the badge) and **"Cancel for a full refund"** → new route
   `POST /api/orders/[id]/cancel-unshipped` (buyer only, CAS on `paid` and
   `shipped_at IS NULL`, full refund via the L6 fault path with reason
   `not_shipped`, reverse transfer, relist, notify artist and admins).
3. Cron `fulfillment-windows` (daily): for `paid` orders past the window with
   no `shipped_at` and no `proposed_ship_by`: on day 5 → system message +
   artist email/notification "ship or offer a date" and stamp
   `platform_nudged_at`; on `platform_nudged_at + 5 business days` with no
   artist message in the thread since and still unshipped → auto-cancel via
   the same refund path (reason `not_shipped`, initiated_by `platform`),
   admin notification. Business-day arithmetic reuses
   `evaluateProtection`'s helper.
4. Order guard: new columns frozen for non-privileged; `cancel-unshipped`
   and the cron write with the service role.
5. Copy on both order cards: the window date ("Ships by {date}"), the missed
   state, and the choices.

**Accept.** Unit: business-day window math; cron selection. e2e
(`E2E_MONEY=1`): a paid Stripe-test order with `created_at` backdated past
the window → buyer cancels → full refund incl. fee, listing available, artist
notified. Rolled-back psql proof of the guard rows.

### L8 — Returns (L) — after L6; minimum for launch, full before the public push (D13)

**Why.** Terms of Sale §5 "Return requirements", Shipping §"Returning the
artwork", Artist Agreement §8: a refund may be conditioned on return; Custom
Canvas provides return instructions incl. address and tracking/insurance
requirements; ship within seven calendar days; refund may be issued after
delivery and inspection; buyer may not keep both. Nothing exists.

**Design constraint.** Do not add order statuses. The status machine
(paid/shipped/delivered/disputed/refunded), its guard, the one-live-order
index and the dispute lifecycle were hardened last week and key on
`status`. Returns are an orthogonal record.

**Do — minimum (launch).**
1. Migration **00063**: table `order_returns` (`id`, `order_id` unique FK,
   `required BOOLEAN`, `reason` (mirrors L6), `authorized_at`,
   `authorized_by` (profile), `return_address JSONB` (D9), `ship_by` =
   authorized_at + 7 calendar days, `instructions TEXT`, `tracking_number`,
   `carrier`, `shipped_back_at`, `received_at`, `inspection_outcome` CHECK IN
   ('accepted','rejected'), `inspection_notes`, `waived_at`, `waived_reason`).
   RLS: buyer and the order's artist SELECT their own; no client writes;
   all writes through routes.
2. Settle-refund gate: when a return record exists and is `required`, the
   admin settle route refuses until `inspection_outcome = 'accepted'` or
   `waived_at` is set (with a reason: unlawful/unsafe/impracticable/
   unnecessary — the documents' list). Change-of-mind approvals default
   `required = true`; `lost_in_transit`/`not_shipped` default `false`;
   `damaged`/`not_as_described` default `true` but waivable.
3. Artist approve-refund modal (change of mind): asks for the return address
   (D9) and any packing/insurance instruction; creates the return record
   authorised by the artist. Admin can create/authorise one for fault
   returns from the admin orders page.
4. Authorisation posts a **system message** in the thread with the
   instructions, the address, the ship-by date and "reply here with the
   tracking number", and emails the buyer. The buyer's Orders card shows
   "Return authorised · ship by {date}" and the instructions.
5. Admin orders page: "Received & inspected" (accepted/rejected + notes) and
   "Waive return". Rejected → admin decides (partial refund is out of scope;
   the documents say "may be issued after… inspection", so a rejected
   inspection means a support conversation, not code).
6. Buyer's Orders card: "I've shipped it back" with tracking number +
   carrier → `POST /api/orders/[id]/return-shipped` (buyer only, CAS on
   authorised and not yet shipped), which is the only client-reachable write.

**Do — full (before the public push).**
7. Artist-side "Mark received" for change-of-mind returns (the artist is
   the one receiving), with the admin still settling.
8. Ship-by reminder cron (day 5 of 7) and an admin alert at day 8 unshipped.
9. Return status on both order cards through every step.

**Accept.** Unit: settle gate matrix (required × outcome × waived). e2e
(`E2E_MONEY=1`): change-of-mind approval creates a return; settle refused;
buyer marks shipped back; admin marks received/accepted; settle succeeds and
the refund math is the change-of-mind split. Rolled-back psql proof that no
client role can write `order_returns`. Money review pass (Section D) covers
the settle gate.

### L9 — Order-page copy, timing and contextual links (S)

**Why.** Shipping §"Damaged or not as described" sets claim windows (visible
damage within **48 hours** of delivery, other material problems within
**seven calendar days**); §"Local pickup" sets pickup within seven calendar
days after ready; Terms of Sale §7 says ask the artist to cancel before
shipping; Seller Protection and Listing Standards need contextual links.
None of that copy is on the product.

**Do.**
1. Buyer's Orders card, delivered state: "Something wrong? Report visible
   shipping damage within 48 hours of delivery and other problems within 7
   days — Request a refund opens the thread; keep the packaging." with the
   Shipping & Returns link. Paid state: "Need to cancel? Ask the artist in
   Messages before it ships." Pickup state: "Arrange pickup within 7 days of
   the ready message."
2. Studio › Sales: Seller Protection link on the badge; Ship modal links
   Artist Agreement §7 (coverage, signature).
3. Listing forms: Listing Standards link in the "About this piece" fieldset
   legend and next to the AI disclosure.
4. Artist Agreement page: "Incorporated: Seller Protection Policy" link
   block at the top.

**Accept.** Copy present in the three order states and the two forms
(screenshots); links resolve.

### L10 — Privacy operations (S)

**Why.** Privacy §6 promises retention: analytics events 24 months, messages
3 years after the last message in a thread, error logs 90 days, profile
deletion within 30 days, backups on a 90-day cycle. No pruning job exists.

**Do.**
1. Cron `retention` (weekly): delete `analytics_events` older than 24 months;
   delete conversations (cascading messages and `chat-attachments` objects)
   whose `last_message_at` is older than 3 years **and** that have no order
   or commission younger than 7 years referencing them (order records are
   kept 7 years; their threads are dispute evidence). Log counts to Sentry
   as info.
2. Verify Sentry's retention is 90 days (project setting) and note it in the
   runbook; Supabase Pro backups are 7-day, inside the 90-day promise.
3. Runbook: rights requests (access/correct/delete/port, 45-day answer,
   60-day appeal, Texas AG referral), breach notification (60 days to
   individuals, 30 days to the Texas AG at 250+), GPC (no action needed —
   no sale or sharing).

**Accept.** Cron runs on DEV against seeded old rows and deletes exactly
those; runbook sections exist.

### L11 — DMCA operations (S–M) — needs A4

**Why.** The DMCA page needs a designated agent, a mailbox, and a way to
count "three substantiated notices within twelve months" per user. Safe
harbor depends on the agent being registered with the Copyright Office.

**Do.**
1. **Chris:** register the designated agent in the U.S. Copyright Office DMCA
   Designated Agent Directory (the $6 filing); create the dedicated mailbox
   (e.g. `dmca@customcanvas.shop` on the existing mail provider — Resend
   does not receive mail); give counsel the details for A4.
2. Migration **00064**: `dmca_notices` (`id`, `subject_profile_id`,
   `listing_id` nullable, `claimant_name/email`, `received_at`, `kind`
   CHECK IN ('notice','counter_notice'), `status` CHECK IN
   ('received','material_removed','counter_received','restored',
   'withdrawn','defective'), `notes`, `acted_by`). Admin-only RLS.
3. Admin page `/admin/dmca`: log a notice against a user/listing, remove the
   listing (sets `hidden` with a `dmca_removed_at` stamp on the listing so
   the artist cannot un-hide it — add the column and guard it), record a
   counter-notice, restore after the 10–14 business-day window, and a
   per-user count of substantiated notices in the trailing 12 months with a
   "repeat infringer" flag at three.
4. `/dmca` page: agent block from A4; a "Send a notice" mailto with the six
   required elements as a template.
5. Runbook section: intake → remove → notify the user (email template with
   the notice summary) → counter-notice → 10–14 business days → restore or
   hold on court action.

**Accept.** Admin can log, remove, and restore; the artist cannot un-hide a
DMCA-removed listing (smoke); the count view is correct against seeded
notices; the page shows the registered agent.

### L12 — Small items in other files (S)

- Artist Agreement §4 "Accepting a dispute": a **"Don't contest this
  dispute"** action on the disputed order card that records
  `dispute_conceded_at` (migration folded into 00060) and notifies admins;
  the webhook's dispute-created email tells the artist it exists. Support
  can still contest.
- Shipping §"Local pickup": no-show handling is a support process; the
  artist's order card gets "Buyer hasn't collected? Contact support before
  cancelling" copy.
- Terms of Sale §2A: "cancel or correct an order before shipment for an
  obvious pricing/tax error" is the L6 `platform_error` full refund.
- Privacy §1: location feature copy in the LocationPicker matches ("we don't
  request background location"; manual ZIP/city entry available) — verify
  and adjust wording only.
- `docs/SELLER_PROTECTION_SPEC.md` and `docs/STRIPE_PLAN.md`: align with
  D7 and L6 (they still carry D6 language).

---

## D. Final testing and go-live

Everything below runs after L1–L12 are merged to master, in this order.

1. **Verification bar on master:** `tsc`, `lint`, `vitest`, `next build`,
   `db-smoke` on DEV.
2. **Full e2e on staging with the money loop:** `E2E_MONEY=1
   ./scripts/run-e2e.sh`, including the new specs (`acceptance`, the eight
   legal pages in `visitor`, the L4 form fields, the L6 fault refund, the L7
   buyer cancel, the L8 return). Green twice: once after the merge, once the
   next nightly.
3. **Money re-review pass** (`docs/reviews/prompts/pass-4-money.txt`, headless,
   writing `04-money-r5.md`) over the refund-reason split, the cancel path,
   the return gate and the signature route. Gate: no P0 or P1.
4. **Prod migrations** 00058–00064 with `db-smoke.sh --prod`; prod deploy;
   verify the eight pages, the checkout link, the interstitial on the
   existing admin and artist accounts.
5. **The first real purchase.** A second real account, one cheap listing,
   a live-card purchase on production, then a change-of-mind refund end to
   end (approve → return authorised → mark shipped back → received → settle),
   then a fault refund. This is the first time live Stripe, the live webhook
   secret and the live Connect account carry this code.
6. **Owner checklist** (from `docs/runbook.md` and `GO-LIVE-PLAN.md`):
   DMCA agent registered and the page live (A4/L11); Upstash in prod (A3 is
   only true if it is); Sentry retention confirmed; the nightly's log read
   for two mornings; counsel has the A1–A3 tweaks and the final DMCA text is
   in the repo.
7. **Go-live** is then a supply question, not a code one: `NEXT_PUBLIC_PAYMENTS_ENABLED`
   is already true in production.

---

## E. Traceability — document promise → phase

| Document | Promise | Phase |
|---|---|---|
| ToS §1, §17 | Acceptance box; affirmative re-acceptance on material change | L2 |
| ToS §2 | 18+ | L2 (D12) |
| ToS §4, ToSale §1, AA §1 | Artist is the seller; surfaces say so | L3 |
| ToS §7, DMCA | Designated agent, notice/counter-notice, repeat infringers | L1, L11 |
| ToS §16.1, ToSale §9 | All eight documents published and cross-linked | L1 |
| ToSale §1 | Summary above Pay; accepted at checkout | L1, L2 |
| ToSale §2, AA §8, Shipping | Fee retained on change of mind, refunded on fault | L6 |
| ToSale §2A | Cancel/correct for obvious error, full refund | L6 |
| ToSale §3, AA §7, Shipping | Missed window → new date or buyer cancel; unreachable artist → platform cancels | L7 |
| ToSale §3, AA §4/§7, Seller Protection req. 4 | Signature confirmation on $750+ | L5 (D7) |
| ToSale §3, Shipping | Pickup within 7 days; no-show handling | L9, L12 |
| ToSale §4, Listing Standards Part one | Edition type, condition, edition details, reproduction labelling | L4 |
| ToSale §5, AA §8, Shipping | Return authorisation, address, 7 days, tracking, inspection, then refund | L8 (D9, D10, D13) |
| ToSale §7, Shipping | Ask the artist to cancel before shipping | L9 |
| AA §4 | Accepting a dispute | L12 |
| AA §4, Seller Protection | Pickup eligibility (documents wrong) | A1, A2 |
| AA §12, Seller Protection | Versioned with the agreement; re-acceptance | L2 |
| Listing Standards Part three | Mature work taggable and filterable | L4 (D8) |
| Listing Standards Part one | Hazard/handling disclosures | L4 |
| Shipping §Damaged | 48-hour / 7-day claim windows | L9 |
| Privacy §3 | Processor list | A3 |
| Privacy §6 | Retention periods | L10 |
| Privacy §7, §8 | Rights requests, breach notice | L10 (runbook) |

**Sizing.** L1 M, L2 M, L3 S, L4 M, L5 S, L6 S–M, L7 M, L8 L (minimum M),
L9 S, L10 S, L11 S–M, L12 S. Parallel groups: {L1, L2, L3} → {L5, L6} →
{L4, L9, L10, L11 in parallel with L7} → L8 → Section D. Roughly ten
sessions plus final testing.

---

## Addenda

### 2026-09-03 — the arc, executed

All twelve phases (L1–L12) built, verified and merged to master. Every ruling
D7–D13 taken at the plan's default, each recorded as a dated entry in
`DECISIONS.md`. Migrations 00058–00065 applied to DEV; **none applied to prod
yet** — that is Section D step 4.

#### Rulings applied (all defaults — Chris can overturn any of them)

| # | Taken as | Where it lives if you want it back |
|---|---|---|
| D7 | Signature confirmation restored as protection requirement 4, recorded by an admin from the carrier's record | `SIGNATURE_CONFIRMATION_AVAILABLE` in `evaluateProtection.ts`; the waiver path is kept and tested |
| D8 | Mature work **hidden by default**, per-browser opt-in | `MatureGate` + the `showMature` default in `runFeedQuery` |
| D9 | The **artist** supplies the return address at approval; Custom Canvas for fault returns | `authorizeReturn` in `src/lib/orderReturns.ts` |
| D10 | Return shipping is **informational** — no labels bought | `returnShippingBearer`, used only in instruction text |
| D11 | Existing accounts re-accept through a **dismissible** interstitial; enforcement is the 403 in 13 write routes | `AcceptanceInterstitial` + `acceptanceGate` |
| D12 | Age attestation rides on the acceptance checkbox; **no date of birth** | registration checkbox + interstitial label |
| D13 | Returns are the **admin-run minimum** at launch | L8 below lists what is deferred |

**Two flagged back to Chris as product calls rather than legal ones**, as the
plan asked: **D8** (hide-by-default versus blur-only — a judgement about how a
first-time visitor meets this work) and **D11** (a blocking interstitial for
existing accounts; taken as dismissible-plus-hard-403, which is the spirit of
the default without locking people out of a marketplace they are still
deciding to trust).

#### Deviations from the plan, and why

1. **Migration numbering shifted.** The plan assigned 00063 to L8 and 00064 to
   L11. An L2 defect found by the e2e suite needed its own migration and took
   00063, so L8 became **00064** and L11 **00065**. Final set: 00058 L2,
   00059 L4, 00060 L5+L12, 00061 L6, 00062 L7, 00063 the L2 fix, 00064 L8,
   00065 L11.
2. **One acceptance route, not two.** The plan specified
   `POST /api/account/accept-terms`; it is `GET`+`POST /api/account/acceptance`
   instead, because the browser also needs to ask what is outstanding and one
   route with two verbs beat two routes sharing a definition.
3. **Seller Protection acceptance is not separately recorded.** The plan had
   `SELLER_PROTECTION_VERSION` "recorded alongside" the agreement version.
   Artist Agreement §4 says the policy "is part of this agreement ... and is
   versioned with it", so the stamped `agreement_version` already covers it
   and a second column would be a second thing to keep in step. The constant
   exists so the UI can name the version being accepted.
4. **Branches, not worktrees.** The plan and the arc prompt called for a
   worktree per phase. This ran as one sequential session, so it used a branch
   per phase in the main tree — identical history, no node_modules symlinks to
   go stale. Worktrees earn their keep when phases run in parallel; nothing
   here did.
5. **L8's e2e asserts the settle gate through the admin UI, not the API.** The
   money spec never captured the full order id, only its 8-character prefix,
   and inventing a lookup for it was worse than asserting the absence of the
   settle control. The server refusal is pinned by the 15-case
   `returnBlocksSettlement` matrix and by db-smoke §14.
6. **No e2e for a real fault refund.** A fault refund and a change-of-mind
   refund are mutually exclusive on one order, and the money spec buys one
   piece. The spec asserts the fault split in the admin modal (switching the
   reason offers the full $28.21 rather than $27.06) and Section D step 5
   walks a real one by hand.

#### Defects found and fixed during the arc

Three of these were mine, introduced by this arc and caught before Chris saw
them. That is the operating loop working, so they are recorded rather than
quietly fixed:

- **The acceptance interstitial opened for every newly registered buyer.** A
  new buyer has the Terms of Sale outstanding *by design* — they accept those
  at checkout — so the dialog appeared over the home feed and its overlay
  swallowed every click. Broke `lover-social` 8.1 and `commissions` 11.1. Now
  gated on the server's `blocks` answer rather than on "anything outstanding".
- **`handle_new_user` broke every signup.** 00063 called
  `current_terms_version()` unqualified; the trigger fires as GoTrue, whose
  `search_path` excludes `public`. Every account creation failed with
  "Database error creating new user". The e2e seeder caught it within the
  hour. db-smoke §12 had *not* — it inserts as a superuser whose search_path
  includes public, so it was pinning the environment rather than the
  behaviour; it now clears search_path first, and that check was verified to
  fail on the broken body.
- **"Complete Setup" fell under the cookie banner.** L2's Seller Protection
  disclosure made onboarding step 2 taller and pushed the primary action
  beneath the fixed banner. An artist finishing onboarding is a first-time
  visitor by definition, so the banner is always up: a genuine launch bug, not
  a test artifact.
- Also caught in review before shipping: the acceptance reminder banner was
  `sticky top-0 z-40`, the same offset and layer as the navbar.

#### What is deferred, deliberately

- **L8's full return flow** (ruling D13): artist-side "mark received" for
  change-of-mind returns, the day-5-of-7 reminder cron with a day-8 admin
  alert, and full return status on both cards through every step. The plan
  defines these as "before the public push"; the launch minimum is built.
- **A1–A3 are counsel's**, collected in `docs/legal/COUNSEL-NOTE-A1-A4.md`.
  Nothing in the product waits on them.
- ~~**A4 / L11 need Chris**~~ — **DONE 2026-09-03.** Counsel returned the
  filled DMCA document and Chris registered the agent: Managing Member, Custom
  Canvas LLC, (832) 319-4756, support@customcanvas.shop, **U.S. Copyright
  Office registration DMCA-1079827** under §512(c)(2). The interim block keyed
  on the placeholders, so `/dmca` published the real agent the moment the text
  landed — no deploy, no code change. There is no separate `dmca@` mailbox and
  none is needed: counsel put support@ in the agent block, which already
  receives mail. L11's acceptance criterion (`dmcaAgentPending()` is false) is
  met.
- **Sentry's 90-day retention** is a project setting nobody can verify from
  here. The Privacy Policy states it as fact, so it is on the runbook and the
  go-live checklist.

