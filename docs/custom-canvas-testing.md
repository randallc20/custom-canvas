# Custom Canvas — Test Document

*Written 2026-07-08, covers everything through Build 3 + refund flow + brand.
Work through it top to bottom per role; each line is a checkbox with the
expected result. Anything that fails, note the step number and what you saw.*

---

## 0. Setup

**Where to test:** https://custom-canvas-chi.vercel.app (staging — always use
this; it has the Stripe webhook, so purchases complete end-to-end. Local dev
stops at the Stripe payment page unless you run the Stripe CLI forwarder.)

**Accounts** (all pre-confirmed, no email verification needed):

| Role | Email | Password |
|---|---|---|
| Buyer | `buyer.test@customcanvas.dev` | `TestPass123!` |
| Artist ("Ada Artist") | `artist.test@customcanvas.dev` | `TestPass123!` |
| Second artist | `artist2.test@customcanvas.dev` | `TestPass123!` |
| Partner (verified gallery) | `bayou-city-gallery@cc-demo.com` | `DemoPass123!` |
| Partner (school) | `glassell-school@cc-demo.com` | `DemoPass123!` |
| Admin | `chris.f.randall@gmail.com` | `TestPass123!` |
| Demo artists | `ada-rivera@cc-demo.com`, `marcus-bell@…`, `lena-park@…`, `diego-soto@…`, `claire-nguyen@…` | `DemoPass123!` |

**Stripe test card:** `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

**Email caveat:** the `*.test@customcanvas.dev` / `*@cc-demo.com` inboxes
aren't real, so you can't *see* delivered emails for them. To verify email
delivery, register a fresh account with an address you own and use that as
the buyer/follower. In-app notifications (the bell) work for every account.

**When testing two roles at once** (e.g. buyer↔artist chat), use two browsers
or a normal + private window — sessions are per-browser.

---

## 1. Anonymous visitor (before logging in)

- [ ] 1.0 **Location**: hero says "your local community" with a Choose-your-city
      button. Set location via ZIP 77005 → navbar pill shows "Houston, TX",
      hero personalizes, feed gains Local/Everywhere chips (Local default).
      Try a city with no artists (e.g. "Austin, TX") → friendly empty state
      with a "Browse everywhere" escape. Location survives reload; "Clear —
      browse everywhere" in the picker resets it. Privacy: the picker
      discloses that geolocation sends coordinates to a geocoding service.
- [ ] 1.1 Homepage loads: logo in navbar, hero ("Discover art from Houston's
      emerging artists"), then shelves — **Featured in Houston**, **From
      {neighborhood}** (rotates weekly), **Picked by Bayou City Gallery** with
      "Visit partner →" — then the Discover feed.
- [ ] 1.2 Feed: infinite scroll loads more art; switch Art/Artists views;
      sort by Newest / Price ↑ / Price ↓ / Most Saved.
- [ ] 1.3 Filters: search box, medium, price range, neighborhoods, schools,
      commissions-open, availability — results change; the URL updates
      (copy it into a new tab → same filtered view).
- [ ] 1.4 Navbar search: type 3+ letters → autocomplete shows artists +
      listings; Enter → filtered feed.
- [ ] 1.4b **Search forgiveness**: "abstract art", "landscape", "oil
      paintings", and partial words like "print" all return sensible
      results (tags are searchable; extra words don't zero the results).
      Nonsense ("zebra unicorn") still returns the empty state.
- [ ] 1.5 Open a listing: image carousel, dimensions/medium/year, price,
      **"Service fee (5%, max $15)" + estimated total + "artist keeps 85%"**
      note, related works below. Share button copies a link.
- [ ] 1.6 Open an artist page: hero with accent color, pinned work, series
      tabs, My Story, education, photos, reviews, commission panel.
- [ ] 1.7 Open `/gallery/bayou-city-gallery`: banner + verified badge,
      **Our picks** shelf with the curator's note in quotes, artist roster,
      Alumni & Students section (on the school partner).
- [ ] 1.8 `/partners`: directory renders, type filter chips work.
- [ ] 1.9 Try to save a heart / Buy Now while logged out → pushed to login;
      after logging in you return to where you were (returnUrl).
- [ ] 1.10 About page: mission + "Fair, Simple Pricing" section (5% fee, cap
      $15, 85% to artists). Terms: fee terms + refund policy paragraph.
- [ ] 1.11 Old URLs redirect: `/galleries` → `/partners`.
- [ ] 1.12 Mobile (or narrow window): hamburger menu, shelves scroll
      horizontally, no sideways page scroll anywhere.

## 2. Registration & onboarding

- [ ] 2.1 Register as **Art Lover** with a real email you own → lands on the
      feed; welcome email arrives (real inbox only).
- [ ] 2.2 Register as **Artist** (second real address or +alias) → 3-step
      onboarding wizard (basics → about → preferences); Back goes one step,
      not out of the wizard; finish → lands in **Studio**.
- [ ] 2.3 Register as **Partner** → org form → "pending verification" state;
      dashboard shows Pending Review badge (verify later as admin, §5.6).
- [ ] 2.4 Log out, log back in: buyer lands on feed, artist in Studio,
      partner on dashboard, admin on admin panel.
- [ ] 2.5 Forgot password: request reset with a real address → email link →
      set new password → log in with it.

### 2.x Artist approval (draft → submit → review → live)

- [ ] 2.6 New artist's Studio shows the **setup checklist** ("Build your
      shop, then submit it for review") with a progress bar; each row
      deep-links to the right page and checks off as you complete it
      (photo tips panel appears in the listing image uploader).
- [ ] 2.7 **Submit is gated**: with no profile photo / story / listing the
      button is disabled with an explanation; complete the essentials →
      button enables.
- [ ] 2.8 While in draft: your public page and your listing's page are NOT
      reachable in a logged-out browser (direct URL → 404), your work is
      absent from the feed/search/artists browse, and YOU can still preview
      your own page.
- [ ] 2.9 **Submit for review** → banner flips to "Your shop is in review";
      admin gets an in-app notification; you can keep editing but a second
      submit says it's already in review.
- [ ] 2.10 As admin: `/admin/applications` lists the submission (story,
      listing count, View profile preview). **Reject** with a reason →
      artist sees the reason in Studio + rejection email → fix something →
      **Resubmit** → back in the queue.
- [ ] 2.11 **Approve** → artist gets "you're live" notification + email;
      their page, listings, and browse presence all appear at once for a
      logged-out browser.

## 3. Buyer journey (buyer.test)

**Discovery & engagement**
- [ ] 3.1 Save a piece (heart pops) → it appears in `/saved`; unsave removes it.
- [ ] 3.2 Follow an artist → appears in `/following`; their page shows
      Following state.
- [ ] 3.3 Revisit the homepage → "Recently viewed" row shows pieces you opened.

**Purchase (the money path — do this one carefully)**
- [ ] 3.4 Pick an available piece from "Ada Artist" (the Stripe-connected test
      artist) → Buy Now → checkout page shows price, shipping, **service fee
      = 5% of price (capped at $15)**, total, "tax at payment" note.
- [ ] 3.5 Fill a Houston address → Pay → Stripe hosted page (Custom Canvas
      branding once you upload it in Stripe) → pay with the test card →
      returned to `/orders?success=true` → order listed as **paid**.
- [ ] 3.6 The piece now shows "no longer available" on its listing page and
      is out of the feed.
- [ ] 3.7 Pickup flow: buy from a pickup-only artist (set artist2 to pickup
      in their profile first) → checkout skips the address, says "coordinate
      via Messages" → after paying, a conversation with the artist opens
      automatically with a system message.

**Orders & refunds (policy: artist-mediated, fee never refunded)**
- [ ] 3.8 `/orders`: statuses/tracking render. **There is no self-cancel.**
- [ ] 3.9 Click **Request a refund** on a paid order → you land in a chat
      with the artist, message prefilled with the order number. Send it.
- [ ] 3.10 After the artist approves (§4.14) the order shows "Refund approved
      — Custom Canvas is settling your payment", and after admin settles
      (§5.4) the order shows **refunded** and the piece is back on the market.

**Reviews**
- [ ] 3.11 On a **delivered** order, Leave a Review (1–5 stars + comment) →
      it appears on the artist's public page with the aggregate updated;
      artist gets a bell notification. A second review on the same order is
      not possible.

**Commissions (chat-first)**
- [ ] 3.12 On an artist page with commissions open → Request a Commission →
      form (title, brief, budget range) → submit → you land **in a new
      conversation** with the artist; inbox `Commissions` tab shows the
      thread with a **New request** pill.
- [ ] 3.13 After the artist quotes (§4.11): quote card appears in the thread
      with Accept / Decline; the rail (right side, or "Commission details"
      sheet on mobile) shows the quote too. Accept → status pill becomes
      **In progress** everywhere, immediately.
- [ ] 3.14 When the artist posts a WIP update: it appears as a system message
      in the thread AND in the rail's timeline; you get a bell notification
      that links straight into the thread.
- [ ] 3.15 After the artist marks delivered: rail shows **Delivered** with
      Confirm Receipt / Report Issue. Confirm → **Closed — completed**.
- [ ] 3.16 Old links still work: `/commissions` → inbox Commissions tab.

**Messaging & safety**
- [ ] 3.17 "Message Artist" on a listing → thread opens with the piece pinned
      as a context banner and a prefilled message. **The message box and Send
      button are visible immediately — no scrolling to find them** (desktop
      and phone; the page itself never scrolls, only the message history).
- [ ] 3.18 Send text, an image, and a PDF attachment (≤10MB) → all render;
      image opens in a lightbox.
- [ ] 3.19 Unread badge on the navbar bubble clears when you read the thread.
- [ ] 3.20 Thread menu: mute (icon shows in list), unmute, block → the other
      party can no longer message you (verify from their side), unblock.

**Account**
- [ ] 3.21 `/account`: edit name; toggle email preferences; change password
      (logs you in with the new one).
- [ ] 3.22 Email unsubscribe: from any received email (real inbox), the
      unsubscribe link one-click disables the optional categories — check
      `/account` reflects it.

## 4. Artist journey (artist.test)

**Studio**
- [ ] 4.1 Log in → you land in `/studio`: needs-attention queue (orders to
      ship / commissions to quote / unread messages), "Last 7 days" strip,
      stat cards, pinned-work picker, Local Verified card, away-mode
      toggle, collapsed "Trends" (expands to 30-day charts).
- [ ] 4.2 Old bookmarks land correctly: `/dashboard`→Studio, `/listings`→
      Work, `/series`→Work?tab=series, `/sales` & `/payouts`→Sales & Money,
      `/analytics`→Studio with Trends open, `/profile/edit`→Public Page.

**Work (listings)**
- [ ] 4.3 New Listing: fill everything incl. up to 8 images (drag to
      reorder; first = cover), price, shipping, series, and **tags from the
      curated picker (style/subject/mood/medium chips, max 10)** → **Save as
      draft**. After publishing, searching one of your tag words finds the
      piece. → it's in Work with a draft badge, not in the public feed.
- [ ] 4.4 **Publish** the draft → followers get a bell notification (and the
      follower email if their inbox is real). Publishing again must not
      re-notify.
- [ ] 4.5 Edit a listing: change price DOWN on a piece someone saved →
      saver gets a price-drop bell (+email); a second drop within 24h does
      NOT re-alert.
- [ ] 4.6 Per-listing views/saves show on each Work row.
- [ ] 4.7 Series tab: create a series with cover image, reorder, delete
      (listings survive deletion); series show as tabs on your public page.
- [ ] 4.8 Delete a listing → confirm dialog → gone from feed and Work.

**Sales & Money**
- [ ] 4.9 After a buyer purchase (§3.5): needs-attention shows "awaiting
      shipment"; Sales & Money shows the order with **your payout (85% +
      shipping)**; Mark as Shipped with a tracking number → buyer sees
      tracking; Mark Delivered → buyer can review. You got a **New sale**
      bell + email.
- [ ] 4.10 Stripe panel: shows Connected for artist.test; "Open Stripe
      Dashboard" works. (For artist2: Connect with Stripe walks the Express
      onboarding and returns to Sales & Money with a success note.)

**Commissions**
- [ ] 4.11 New request (from §3.12) shows in needs-attention and the inbox
      Commissions tab (**New request** pill). Open the thread → the rail
      shows the brief and budget → **Send Quote** (price, timeline, notes)
      → quote card lands in the thread.
- [ ] 4.12 Post a WIP update from the rail (note + photo + progress %) →
      appears in the thread as a system message; buyer notified.
- [ ] 4.13 Mark as Delivered from the rail → buyer confirms → **Closed**.
      Sanity: after the buyer accepted a quote, trying stale actions (e.g.
      decline) gives a clear error, not silent corruption.

**Refunds**
- [ ] 4.14 On a paid order in Sales & Money → **Approve refund** → dialog
      explains: buyer gets price+shipping, service fee is not refunded,
      your payout is returned → approve → row shows "Custom Canvas is
      settling the payment"; every admin gets a bell.

**Public page builder**
- [ ] 4.15 Public Page tab: edit story, mediums, neighborhood, school +
      year, statement, influences, website; upload avatar + banner;
      completeness % rises as you fill things in.
- [ ] 4.16 Accent color: pick a different swatch → YOUR public page CTAs
      re-theme; bio layout switch changes the hero.
- [ ] 4.17 Personal photos (≤10, captions) upload and show in Meet-the-Artist.
      (Videos are intentionally not supported.)
- [ ] 4.18 Education: add an entry naming "Glassell School of Art" → you
      appear under Alumni & Students on that partner's page automatically.
- [ ] 4.19 **Preview as visitor** (primary button) opens your public page
      as buyers see it.
- [ ] 4.20 Pinned work: pin up to 3 pieces on Studio home → they lead your
      public page in that order.
- [ ] 4.21 Away mode: enable with a return date + auto-reply → your page
      shows the away banner, Buy is disabled, commissions pause; a buyer
      messaging you gets ONE auto-reply per conversation. Disable → all
      restored.
- [ ] 4.22 Local Verified: submit a request (type + details + links) →
      pending state; only one open request allowed. After admin approves
      (§5.6) → badge on your page + bell + email.

## 5. Admin journey (chris.f.randall@gmail.com)

- [ ] 5.1 `/admin`: stats cards, 30-day charts, recent orders + signups,
      and nav cards — **Featured, Users, Galleries, Listings, Orders,
      Disputes, Verifications** (all seven reachable).
- [ ] 5.2 **Featured**: search available listings → Feature (cap 10) →
      reorder with ↑↓ → homepage shelf updates on refresh; Remove asks for
      confirmation. Feature a piece, have its artist hide it → row shows
      "unavailable" but can still be removed.
- [ ] 5.3 Users: search, view roles. Listings: search; **hidden/draft
      listings are visible here**; Hide a listing → gone from the public
      feed.
- [ ] 5.4 Orders: table with totals; on an order the artist refund-approved
      (§4.14) a **Settle refund** button shows → dialog states exactly what
      moves (buyer gets price+shipping; artist payout reversed; fee kept) →
      settle → status flips to refunded, piece relists (unless another live
      order holds it).
- [ ] 5.5 Disputes: reports from chat (report a message as the buyer first)
      appear; resolve with dismiss / action-taken + notes.
- [ ] 5.6 Verifications: approve the artist's Local Verified request
      (§4.22) and verify a pending partner from §2.3 (Galleries page) →
      both get badges + notifications.
- [ ] 5.7 Admin bell: the refund-approval notification from §4.14 links to
      `/admin/orders`.

## 6. Partner journey (bayou-city-gallery)

- [ ] 6.1 Dashboard: verified badge; Edit Profile / View Public Page beside
      the heading.
- [ ] 6.2 Roster: search artists → add → they show under Represented on
      your public page; remove works (with confirm).
- [ ] 6.3 **Your Picks**: add up to 6 available pieces (cap enforced), write
      a public note on one, reorder, remove → public page "Our picks"
      updates, note renders in quotes under the card; homepage "Picked by"
      shelf shows your selection.
- [ ] 6.4 Partners can also buy and request commissions (badge shows next
      to their name in the commission thread).

## 7. Cross-cutting checks

- [ ] 7.1 **Fee math spot-check** (listing page vs checkout vs order):
      $50 piece → $2.50 fee; $150 → $7.50; $300+ → capped $15.
- [ ] 7.2 Every destructive action (delete listing/series, remove pick,
      block, refund) shows a confirm dialog; Cancel is left, action right.
- [ ] 7.3 Back button (top-left) is flush with the page content column on
      every page and never appears on the home feed or mid-onboarding.
- [ ] 7.4 Bell notifications: each links somewhere sensible (commission →
      its thread; sale → Sales & Money; refund → admin orders).
- [ ] 7.5 No "report" control on listing pages (removed by design); report
      IS available on chat messages/users.
- [ ] 7.6 Logo/brand: navbar lockup, footer mark, browser-tab favicon,
      share preview (paste the site URL into a Slack/iMessage → card image
      appears), email header (real inbox).
- [ ] 7.7 Do a full pass of §1 and §3.4–3.5 on a phone.

## 8. Known limitations (don't file these)

- Emails only deliver to real inboxes; sender is `onboarding@resend.dev`
  until the domain is verified at launch.
- Tax on the Stripe page is test-mode; refunds return price+shipping, not
  the tax attributable to them (accepted simplification, revisit at scale).
- Rate limits are per-server-instance (bursts of >30 listing writes/min may
  429 — expected).
- This is the DEV database; anything you create here is throwaway.
