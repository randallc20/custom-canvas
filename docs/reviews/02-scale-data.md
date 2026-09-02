# Scalability & the data layer — review 2026-09-02

**Files read:**

- Context: `docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`, `docs/reviews/01-auth-access.md` (header only, for format).
- `src/services/**`: all 20 files in full, except `email.ts`, which I only grepped for `.from(`/`.rpc(` (it issues no database reads, so its body is out of this pass).
- `src/hooks/**`: all 24 files in full. `src/lib/queryClient.ts`, `src/lib/supabase.ts`, `src/lib/supabase-server.ts`, `src/lib/publicProfile.ts`, `src/lib/listingAlerts.ts:20-95`.
- Realtime and global state: `src/context/UnreadContext.tsx`, `src/context/NotificationContext.tsx`, `src/app/providers.tsx` in full; `src/context/AuthContext.tsx` and `src/context/LocationContext.tsx` grepped for state identity and the `ready` gate.
- Read-path pages: `src/app/(public)/page.tsx`, `(public)/artist/[slug]/page.tsx`, `(public)/listing/[id]/page.tsx`, `(public)/gallery/[slug]/page.tsx`, `dashboard/page.tsx`, `(user)/orders/page.tsx`, `(artist)/studio/page.tsx`, `studio/sales/page.tsx`, `studio/work/page.tsx`, `messages/page.tsx`, `messages/[conversationId]/page.tsx`, `sitemap.ts`, `api/artists/route.ts`, `api/artists/[slug]/route.ts`, `api/listings/route.ts`. `api/payments/checkout/route.ts` and `api/webhooks/stripe/route.ts` grepped only for where the `orders` row is created.
- Components on those paths: `feed/{ArtFeed,FeedCard,ArtistBrowseCard,HomeShelves,RecentlyViewed}.tsx`, `home/HomeHero.tsx`, `layout/Navbar.tsx`, `notification/NotificationDropdown.tsx`, `analytics/TrackView.tsx`, `studio/{PayoutsSection,SalesSection,NeedsAttention,ListingsSection}.tsx`, `chat/{ConversationList,PresenceIndicator}.tsx` in full. Read around their mutation call sites only: `gallery/PartnerPicksManager.tsx`, `admin/featured/page.tsx`, `listing/ReportButton.tsx`, `profile/ArtistProfileEdit.tsx`, `chat/ChatThread.tsx`, `review/ReviewForm.tsx`, `(artist)/listings/new/page.tsx`, `(artist)/listings/[id]/edit/page.tsx`. Every `.mutate(` and `.mutateAsync(` call in `src/` was enumerated.
- Migrations in full: 00001, 00028, 00031, 00033, 00036, 00044. All 48 were indexed by grep for `CREATE INDEX`, `UNIQUE`, `PRIMARY KEY`, `CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT`, `supabase_realtime`, and every `CREATE POLICY` on `listings`, `listing_images`, `orders`, `messages`, `conversations`, `artist_profiles`; the `CREATE TABLE` blocks of 00002, 00003, 00013, 00019, 00021, 00024, 00026, 00034 and the index context in 00010, 00030, 00038 were read. That grep is the basis for every "no index" claim below.
- Skipped: admin pages (out of scope), `FeedFilters`/`FilterDrawer` (only their hook usage matters), `SeriesTabs` (grepped for client-side filtering only), `supabase/seed.sql` (data only). There is no `supabase/config.toml`, so the project's PostgREST `max_rows` setting could not be read; findings that depend on it say so.

**Verdict:** The service layer is small, consistent, and follows the conventions: paginated where it matters (feed, artists, messages), keyset on messages, explicit column lists on the column-restricted tables, and no per-row fetch loops in `services/**`. What has not been done is the physical layer: 48 migrations have produced exactly four non-unique indexes, none of them on the foreign keys the read paths filter by, and three homepage-adjacent reads (feed image embeds, the recently-viewed shelf, the neighborhood spotlight) do work proportional to the whole table on every visit.

**Verification 2026-09-02 (R0):** the 414 threshold does not exist at realistic sizes: a `messages?conversation_id=in.(…)` request with 250 ids (9.3 KB URL) and 600 ids (22 KB URL) both return HTTP 200 from Supabase's edge with the anon key. The unread-counts finding stands on the row-download and max-rows halves only; the RPC in R7 still removes the id list.

**What breaks first at 100 artists / 10,000 listings / 50,000 orders:** `runFeedQuery` in `src/services/feed.ts:58-104`, behind the homepage `/` (ArtFeed → useFeed). Every card row embeds `listing_images(*)` and `listing_images` has no index on `listing_id`, so PostgREST's per-row LATERAL subquery sequentially scans the whole images table once per listing row, and offset paging makes page *k* pay for *k×20* of those scans. The same missing index is under the artist page, the saved page, and every shelf. Second, and overtaking it as traffic accumulates: `RecentlyViewed` (`src/components/feed/RecentlyViewed.tsx:18-25`), which sequentially scans `analytics_events`, the fastest-growing and never-pruned table, on every signed-in homepage load. No P0 or P1 was found in this slice: nothing here loses money or leaks data, and the money totals that go wrong do so only past a 1,000-row tail.

---

### P2 — `listing_images` has no index on `listing_id`; every card embed is a sequential scan per parent row, multiplied by offset paging

**Where:** `supabase/migrations/00001_initial_schema.sql:193-200` (table, no index; the only later change is the 00036 policy). Consumers: `src/services/feed.ts:60,103-104`; `src/app/(public)/artist/[slug]/page.tsx:69-74`; `src/services/saved.ts:5-9`; `src/services/artists.ts:49-54`; `src/app/(public)/listing/[id]/page.tsx:36-40,56-62`; `src/services/featured.ts:11-15`; `src/services/partnerPicks.ts:17-24`; `src/components/feed/RecentlyViewed.tsx:35-39`.

**What happens:** An anonymous visitor opens `/` and scrolls. Each page of the infinite feed is one PostgREST request whose SQL has the shape `SELECT listings.*, (LATERAL SELECT json_agg(...) FROM listing_images WHERE listing_id = listings.id) ... ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET 20k`. The lateral aggregate is correlated, so Postgres runs it as a parameterized nested loop, and with no index the inner side is a sequential scan of `listing_images` (≈30,000 rows at 10,000 listings × 3 images) filtered on `listing_id`. OFFSET is implemented by pulling and discarding rows through that nested loop, so the tenth page runs ≈220 full scans and the twenty-fifth ≈520. The request time climbs from tens of milliseconds on page one to seconds by the depth a normal scroll session reaches, the IntersectionObserver keeps firing, and the CPU is shared with every other query on the instance. The artist page for a prolific artist runs one scan per listing on every render (`cache: 'no-store'`, so no Next cache), as does `/saved` for a heavy saver.

**Why it's real:** The grep of all 48 migrations shows no `CREATE INDEX` on `listing_images` and no unique constraint containing `listing_id`; Postgres does not create indexes for foreign keys. `listing_tags` is fine because its primary key leads with `listing_id`; `listing_images` uses a surrogate `id` PK. The 00036 SELECT policy on `listing_images` adds two `EXISTS` probes per candidate row, but those are PK lookups and the planner evaluates the cheap equality first, so the policy is not the cost. The plan shape (nested loop + seq scan, OFFSET pulling through the loop) is what Postgres does for a correlated aggregate; it has not been confirmed with `EXPLAIN ANALYZE` against production data, which is what would settle the exact timings.

**Fix direction:** `CREATE INDEX listing_images_listing_idx ON listing_images (listing_id, display_order)`, and while there, `listings (status, created_at DESC)` and `listings (artist_id)` for the feed sort and the artist page filter. Consider replacing offset paging with a keyset on `(created_at, id)` for the default sort, which is unique and covers the common case.

### P2 — The "Recently viewed" shelf sequentially scans the whole `analytics_events` table on every signed-in homepage load

**Where:** `src/components/feed/RecentlyViewed.tsx:18-25`; index `supabase/migrations/00002_missing_tables_and_policies.sql:169`; policy `00044_recently_viewed_rls.sql:7-8`; writers `src/components/analytics/TrackView.tsx:18-29` and `src/services/analytics.ts:4-18`.

**What happens:** A signed-in buyer opens `/`. Before the shelf can render, the browser issues `analytics_events WHERE viewer_id = me AND event_type = 'listing_view' AND listing_id IS NOT NULL ORDER BY created_at DESC LIMIT 60`. The only index is `(artist_id, event_type, created_at DESC)`, whose leading column is not constrained, so the query is a full sequential scan plus a top-N sort. `TrackView` inserts one row per listing view and per profile view, from anonymous visitors too (`viewer_id` null, insert policy `WITH CHECK (true)`), and nothing prunes the table. At the stated scale with modest traffic the table passes a million rows within months; every signed-in homepage visit then pays a full scan of the largest table in the database for a shelf that shows 12 items. Unlike the feed cost, this grows with cumulative traffic, not with listing count, so it keeps getting worse after everything else has been tuned.

**Why it's real:** No migration creates an index with `viewer_id` in it (grep above). The shelf is unconditional for logged-in users (`if (!user) return null` is the only gate) and runs in a bare `useEffect`, so it is not even deduplicated across remounts by React Query. The RLS policy `viewer_id = auth.uid()` (00044) is a row filter, not an access path.

**Fix direction:** A partial index, `analytics_events (viewer_id, created_at DESC) WHERE event_type = 'listing_view' AND listing_id IS NOT NULL`, makes this an index-only walk of at most 60 entries. Longer term, a small `recently_viewed (profile_id, listing_id, viewed_at)` upsert table capped per user, and a retention window on `analytics_events`.

### P2 — Every signed-in tab subscribes to every `messages` INSERT and UPDATE, unfiltered, and the RLS check behind it has no index

**Where:** `src/context/UnreadContext.tsx:38-50` (channel), `:24-28` (the count it triggers); mounted app-wide by `src/app/providers.tsx:19`. Policy `supabase/migrations/00001_initial_schema.sql:299-302`; `conversations` table `:266-275` (PK only, no participant index).

**What happens:** Every logged-in user on every page holds a `postgres_changes` subscription on `public.messages` with no `filter`. Supabase Realtime enforces RLS per subscriber per change: for each row change it evaluates the `messages` SELECT policy once for every connected subscriber, and that policy is `conversation_id IN (SELECT id FROM conversations WHERE participant_one = auth.uid() OR participant_two = auth.uid())`, a sequential scan of `conversations` because neither participant column is indexed. `markMessagesAsRead` updates every unread row in a thread in one statement, so opening a thread with 40 unread messages emits 40 UPDATE events. With 300 tabs open that is 12,000 policy evaluations, each scanning a `conversations` table that the webhook grows by one row per pickup order and every "Message artist" click grows further. Each subscriber that passes then re-runs an exact `count(*)` over `messages` under the same policy. When Realtime falls behind, badges lag for everyone; the database CPU it burns slows the feed at the same time. Supabase's own guidance is that unfiltered `postgres_changes` on an RLS table does not scale past a modest subscriber count.

**Why it's real:** `NotificationContext` shows the intended pattern (`filter: user_id=eq.<id>`), and `useMessages` filters by `conversation_id`; this one cannot filter because `messages` has no recipient column, so the workaround was "subscribe to everything". The channel is torn down correctly on unmount, so the problem is breadth, not leaks. This is the only unfiltered subscription in the app (grep of `.channel(`). Exact throughput at which Realtime degrades is UNVERIFIED (it depends on the plan's Realtime quota and instance size); the per-change, per-subscriber policy evaluation is documented behavior.

**Fix direction:** Give the badge a per-user signal Realtime can filter on: either a `recipient_id` column on `messages` set by trigger, or a trigger-maintained `unread_counters (user_id, count)` row subscribed with `filter: user_id=eq.<id>`. Alternatively drop Realtime for the badge and poll the count on the 30-second cadence `useUnreadCounts` already uses. Either way add `conversations (participant_one)` and `conversations (participant_two)` and a partial `messages (conversation_id) WHERE is_read = false`, which the policy and the count both need regardless.

### P2 — One saved-status lookup per feed card, and one heart click refetches all of them

**Where:** `src/components/feed/FeedCard.tsx:21` with `src/hooks/useSaved.ts:14-20`; the invalidation `src/hooks/useSaved.ts:42-45`; same per-card pattern on `src/components/feed/ArtistBrowseCard.tsx:17` with `src/hooks/useFollows.ts:14-19`.

**What happens:** A signed-in buyer scrolls five pages of the feed. Each of the 100 cards mounts its own `useIsSaved(profileId, listingId)` query, so on top of five feed requests the browser issues 100 `saved_listings` point lookups. The buyer then hearts one piece. `useToggleSave` invalidates `['saved', profileId]`, and React Query matches keys by prefix, so every mounted `['saved', profileId, listingId]` query is marked stale and, being active, refetches immediately: 101 requests fire at once (the second `invalidateQueries` call on the three-part key is redundant). They queue behind the browser's six-connections-per-host limit, so the next feed page the observer requests stalls behind them, and each click costs the Supabase API ~100 requests. The artists view has the same N+1 on `follows` (its invalidation is exact, so no storm).

**Why it's real:** The lookups are point reads on the `saved_listings` PK, so the database cost per request is trivial; the cost is request count. There is no shared "my saved ids" query anywhere, and the default `staleTime` of 60 s only helps on remounts within a minute. Prefix invalidation is React Query's default (`exact: false`).

**Fix direction:** Fetch the viewer's saved listing ids once (`['saved-ids', profileId]` → a `Set`) and derive `isSaved` per card from it; the toggle updates that one key optimistically and invalidates it alone. Same shape for followed artist ids.

### P2 — Studio money totals and the sitemap are computed from unbounded reads that PostgREST silently caps

**Where:** `src/services/orders.ts:18-27` (`getOrdersByArtist`, no limit, `select('*')`), consumed by `src/components/studio/PayoutsSection.tsx:34-36` ("Total Earnings", "Completed Sales") and `src/app/(artist)/studio/page.tsx:37-38` ("Revenue"); `src/services/analytics.ts:40-44` (`total_earnings_cents`) and `:45-51` (30-day views, ascending, no limit); `src/app/sitemap.ts:9-10`; also unbounded: `src/services/conversations.ts:11-19`, `src/services/messages.ts:95-100`, `src/services/reports.ts:57-61`, `src/app/(public)/artist/[slug]/page.tsx:69-74`.

**What happens:** Supabase's PostgREST ships with `max_rows = 1000`, and nothing in this repo raises it (there is no `supabase/config.toml`). An artist with 1,200 lifetime orders opens Studio → Sales & Money: PostgREST returns the newest 1,000 rows, "Total Earnings" and "Completed Sales" silently omit the oldest 200 orders, and nothing on screen says the list is partial. The 30-day views chart in Trends is worse: its query orders `created_at` ascending with no limit, so a truncation keeps the oldest 1,000 events and the chart shows the first day or two of the month and then flat zero. The sitemap at 10,000 available listings emits the first 1,000 listing URLs in arbitrary order (no `ORDER BY`), so 9,000 listing pages are never offered to search engines. If the project has instead raised or removed the cap, the failure flips: the same artist downloads every full order row (≈40 columns including `shipping_address` JSONB and Stripe ids) on every Studio visit.

**Why it's real:** None of the listed queries has `.limit()`, `.range()`, or a server-side aggregate; every total is a client-side `reduce`. At the stated scale the average artist has 500 orders, so this needs a top seller, but that is exactly who looks at "Total Earnings". UNVERIFIED: the project's actual max-rows value. What settles it: Dashboard → Settings → API → "Max rows", or run `supabase.from('analytics_events').select('id')` in the browser console and count the result once the table has more than 1,000 rows.

**Fix direction:** Move totals server-side: an RPC or view returning `sum(artist_payout_cents), count(*) filter (...)` per artist, and paginate the Sales list. Sitemap via `generateSitemaps` with `.range()` pages, or at minimum `.order('created_at')` so the truncated set is stable.

### P2 — Inbox unread counts ride every conversation id in the query string, polled every 30 s, and are counted by downloading rows

**Where:** `src/services/messages.ts:92-108`; `src/hooks/useMessages.ts:81-88`; `src/app/messages/page.tsx:33-34`; `src/app/messages/[conversationId]/page.tsx:38-39`; the same `.in()` pattern at `src/services/conversations.ts:30-34`.

**What happens:** `useUnreadCounts` sends `messages?conversation_id=in.(id,id,...)` with every conversation the user has, 37 bytes per id, and re-sends it every 30 seconds. An artist with a few hundred open threads (the webhook opens one per pickup order, every "Message artist" and "Request a refund" opens another) pushes the request line past the gateway's limit and gets a 414. `useQuery` retries once, fails, and leaves `data` undefined: every thread in the inbox shows no unread badge, the failure repeats every 30 seconds, and nothing surfaces it (no toast, no Sentry, the list simply renders unbadged). Below that threshold the query still returns one row per unread message rather than a count, so a spammy backlog above 1,000 unread rows is also silently truncated by the cap in the previous finding.

**Why it's real:** The id list is unbounded and grows with conversation count; nothing chunks it. UNVERIFIED: the exact byte limit at Supabase's edge (nginx-style defaults reject request lines over 8 KB, ≈200 ids; Cloudflare's is 16 KB). What settles it: hit the REST endpoint with a synthetic 250-id `in.()` filter and look for a 414.

**Fix direction:** One RPC (or view) `my_unread_counts()` that does `SELECT conversation_id, count(*) ... GROUP BY 1` under the caller's RLS, with no id list in the URL; keep the 30-second poll or drive it from the badge signal in the Realtime finding.

### P2 — The neighborhood spotlight downloads every available listing to count neighborhoods in the browser

**Where:** `src/services/featured.ts:35-51`; `src/hooks/useFeatured.ts:19-26`; mounted on `/` by `src/components/feed/HomeShelves.tsx:15`.

**What happens:** Every visitor's homepage runs `listings?select=artist:artist_profiles!inner(neighborhood)&status=eq.available` with no limit, then tallies neighborhoods client-side to pick this week's shelf. At 10,000 listings that is a full scan of `listings`, 10,000 PK probes into `artist_profiles` for the embed and 10,000 more for the RLS `EXISTS`, per visitor, cached for five minutes per browser and never shared. Under the default 1,000-row cap it is cheaper but wrong: with no `ORDER BY`, which 1,000 rows come back is up to the planner, so the eligible-neighborhood set shifts between requests and two visitors (or one visitor after a reload) can see different "This week" neighborhoods on the same day, defeating the deterministic weekly rotation the code documents.

**Why it's real:** The count is computed from `data.length` per neighborhood in JavaScript; there is no server-side aggregate and no `.limit()`. `useNeighborhoodSpotlight` is enabled as soon as the location context is ready, for anonymous visitors too.

**Fix direction:** A view or RPC `neighborhood_listing_counts(city)` doing `GROUP BY neighborhood HAVING count(*) >= 3`, one row per neighborhood. The follow-up `getFeedListings({ neighborhoods: [x], limit: 8 })` is already bounded.

### P2 — Buyer lands on `/orders?success=true` before the webhook has written the order, and nothing refetches

**Where:** `src/app/(user)/orders/page.tsx:31-33,80-87`; `src/hooks/useOrders.ts:12-18`; `src/lib/queryClient.ts:10` (`staleTime: 60_000`); the order row is created only by the webhook, `src/app/api/webhooks/stripe/route.ts:190-191`; the redirect is `src/app/api/payments/checkout/route.ts:179`.

**What happens:** A buyer pays. Stripe redirects to `/orders?success=true`; the page fetches `orders` for the buyer once. If `checkout.session.completed` has not yet been processed (Stripe documents that the redirect can precede the webhook, and the handler does Stripe API calls and several writes before the insert), the list is empty, so the page renders "Your purchase was successful!" directly above "No orders yet". `useBuyerOrders` has no `refetchInterval` and there is no Realtime on `orders`; with a 60-second `staleTime`, navigating to Saved and back serves the cached empty list, and `refetchOnWindowFocus` only refetches stale queries. The state persists until the buyer reloads by hand. The refund-request and review buttons live on that list, so for that interval the buyer's only receipt is a banner.

**Why it's real:** The checkout route creates no `orders` row (grep: no `from('orders')` in it); the insert is at webhook line 190. The orders page has no `justPurchased`-aware polling. Arguably P1 because every purchase goes through this redirect; I have rated it P2 because the window is seconds and a reload recovers, but it is the one stale-money-data path in this slice that a normal user will actually hit.

**Fix direction:** When `justPurchased` is set and the newest order is missing (or older than a minute), poll `['orders','buyer',id]` every few seconds for up to a minute, or have the success page confirm against `?session_id=` via a small route that waits on the payment-intent id. Consider `staleTime: 0` for the order keys.

### P2 — `/api/listings` and `/api/artists` GET are public, unbounded, and unused

**Where:** `src/app/api/listings/route.ts:7-18`; `src/app/api/artists/route.ts:5-20`. No caller in `src/` (grep for `fetch('/api/listings` and `fetch('/api/artists`).

**What happens:** Anyone can request `/api/listings` unauthenticated and receive every available listing with all images (RLS only removes non-live artists' work). Each hit is the full `listings` scan plus one unindexed `listing_images` lateral scan per row (first finding), serialized through a Vercel function, up to the max-rows cap or, if the cap was raised, all 10,000 rows with images (megabytes). A scraper or a curious user in a loop is the cheapest way an outsider can burn the project's database CPU and Vercel egress, on endpoints the application itself never calls. `/api/artists` is the same for profiles (bounded by 100 artists today, but with the `profiles` embed on each).

**Why it's real:** Both handlers are reachable and return 200 with data; neither has `.range()`/`.limit()`; no component or service references them (the app reads through supabase-js directly). UNVERIFIED: whether `middleware.ts` rate-limits these paths (out of my scope; the auth pass would know).

**Fix direction:** Delete both GET handlers. If a JSON listing API is wanted later, paginate it and gate it.

### P2 — The foreign-key filters `services/**` actually issues run without indexes

**Where:** Table definitions in `supabase/migrations/00001_initial_schema.sql` and `00002_missing_tables_and_policies.sql`; the complete index inventory across 48 migrations is: `artist_profiles(search_vector)` GIN, `listings(search_vector)` GIN, `messages(conversation_id, created_at DESC)`, `notifications(user_id, is_read, created_at DESC)`, `analytics_events(artist_id, event_type, created_at DESC)`, `commission_updates(commission_id, created_at DESC)`, `reviews(artist_id)`, `artist_profiles(application_status)`, `artist_education(partner_id)`, `gallery_artists(gallery_id)`, `gallery_artists(artist_id)`, plus PKs and unique constraints.

**What happens:** At 50,000 orders every Studio load (`getOrdersByArtist`, shared by four components) and every buyer's `/orders` is a sequential scan of `orders`; the RLS policies `artist_id IN (...)` on `orders`, `listings`, `commissions`, `analytics_events` do resolve via the unique index on `artist_profiles(profile_id)`, so the policy side is fine, but the row filter is not. Every artist page runs `getFollowerCount`, a `count(*)` on `follows` by `artist_id`, whose PK leads with `follower_id`, so it is a full scan of `follows`; the same table is scanned by the `notify_followers_new_listing` trigger on every publish and by `fanOutNewListingEmails`. Price-drop fan-out (`notify_savers_price_drop`, `fanOutPriceDropEmails`) scans `saved_listings` by `listing_id`, whose PK leads with `profile_id`. None of these is the first thing to break at the stated scale (each is a single scan of tens of thousands of narrow rows, milliseconds), but they are all on hot paths, and two of them (`conversations` participants, `listing_images`) sit inside RLS policies and lateral embeds where they are multiplied, as the earlier findings describe.

**Why it's real:** Coverage of every filter and order-by issued by `services/**` and the read-path pages, from the grep inventory above:

| Query | Filter / order | Index used | Missing |
|---|---|---|---|
| `feed.ts` runFeedQuery | `status`, `price_cents`, `save_count`, `created_at` sort; embed `artist_profiles.is_live/city/neighborhood/school` | none on listings (artist_profiles by PK) | `listings(status, created_at DESC)`; `listings(status, price_cents)`; `listings(status, save_count DESC)` |
| `feed.ts` runFeedQuery textSearch | `search_vector` | GIN ✓ | |
| `feed.ts` runArtistsQuery | `is_live`, `city ilike`, `created_at` sort | none (100 rows, fine) | |
| `feed.ts` getFilterOptions | `is_live` | none (100 rows, fine) | |
| `listings.ts` getListingById | `id` | PK ✓ | |
| `listings.ts` getListingImages, every `images:listing_images(*)` embed | `listing_id`, `display_order` | **none** | `listing_images(listing_id, display_order)` |
| `artists.ts` getArtistBySlug | `slug` | UNIQUE ✓ | |
| `artists.ts` getArtistListings; artist page listings; related listings | `artist_id`, `status`, `created_at` sort | **none** | `listings(artist_id, created_at DESC)` |
| `orders.ts` getOrdersByBuyer | `buyer_id`, `created_at` sort | **none** | `orders(buyer_id, created_at DESC)` |
| `orders.ts` getOrdersByArtist; `analytics.ts` order sums | `artist_id`, `status`, `created_at` | **none** | `orders(artist_id, created_at DESC)` |
| `conversations.ts` getConversations, findOrCreate; messages RLS subquery | `participant_one`, `participant_two`, `last_message_at` sort | **none** | `conversations(participant_one)`, `conversations(participant_two)` |
| `conversations.ts` commission status lookup | `commissions.conversation_id in (...)` | **none** | `commissions(conversation_id)` |
| `messages.ts` getMessages, markMessagesAsRead, getUnreadCounts | `conversation_id`, `created_at` | ✓ | partial `(conversation_id) WHERE NOT is_read` for the counts |
| `UnreadContext` count | `sender_id <>`, `is_read = false` under RLS | none on `is_read` | same partial index |
| `notifications.ts`; `NotificationContext` count | `user_id`, `is_read`, `created_at` | ✓ | |
| `commissions.ts` byArtist / byRequester | `artist_id` / `requester_id` | **none** | `commissions(artist_id)`, `commissions(requester_id)` |
| `commissionUpdates.ts` | `commission_id`, `created_at` | ✓ | |
| `follows.ts` getFollowedArtists, isFollowing, unfollow | `follower_id` (+ `artist_id`) | PK ✓ | |
| `follows.ts` getFollowerCount; `analytics.ts` follower count; publish trigger; email fan-out | `artist_id` | **none** | `follows(artist_id)` |
| `saved.ts` getSavedListings, isListingSaved, unsave | `profile_id` (+ `listing_id`) | PK ✓ | |
| price-drop trigger; `listingAlerts.ts` | `saved_listings.listing_id` | **none** | `saved_listings(listing_id)` |
| `reviews.ts` getReviewsByArtist; artist page reviews | `artist_id`, `created_at` | ✓ (reviews_artist_id_idx) | |
| `reviews.ts` getReviewByOrderId | `order_id` | UNIQUE ✓ | |
| `analytics.ts` counts, 30-day views; `WeekStrip` | `artist_id`, `event_type`, `created_at` | ✓ | |
| `RecentlyViewed` | `viewer_id`, `event_type`, `created_at` sort | **none** | partial `analytics_events(viewer_id, created_at DESC)` |
| `artistContent.ts` education/photos/videos/series | `artist_id`, `display_order` | **none** (a few rows per artist; fine) | |
| `chatSafety.ts` blocked/muted | `blocker_id` / `profile_id` | PK ✓ | |
| `featured.ts` shelf/admin; `partnerPicks.ts` | `display_order`; `gallery_id` | PK ✓ (tiny tables) | |
| `reports.ts` getReports (admin) | `created_at` sort | none | out of scope |

**Fix direction:** One migration adding the bold rows above; ship it with the smoke test per `CONVENTIONS.md`. Verify with `EXPLAIN (ANALYZE, BUFFERS)` on the feed and Studio queries against staging data before and after.

### P3 — Two `.mutate()` calls have no `onError` anywhere in the chain (CONVENTIONS violation)

**Where:** `src/components/listing/ReportButton.tsx:33-36` with `src/hooks/useReports.ts:4-8`; `src/components/chat/ChatThread.tsx:34` with `src/hooks/useMessages.ts:90-99`. `src/lib/queryClient.ts` defines no mutation defaults and no `MutationCache` handler.

**What happens:** A user fills in "Report this listing" and clicks Submit; the insert fails (rate limit, network blip, a future policy change). `isPending` clears, the modal stays on the form, nothing says why, and no report was filed; the user assumes it went through and closes the dialog. For mark-as-read: the update fails silently, the thread's unread badge never clears, and the user re-opens the thread wondering why.

**Why it's real:** `CONVENTIONS.md` rule 2 bans exactly this: "never `.mutate()` on a mutation hook with no `onError` anywhere in the chain". Every other `.mutate(` call in `src/` either uses a hook that wires `toastError` or passes a call-site `onError`; all `.mutateAsync` sites are inside `try/catch`. These two are the only exceptions.

**Fix direction:** Add `onError: toastError(toast, 'useCreateReport')` and `onError: toastError(toast, 'useMarkAsRead')` at the hook level, matching the exemplars in `useSaved`/`useFollows`.

---

## Appendix: minor

- `src/services/feed.ts:60` selects `listings.*` for cards, which ships `search_vector` and full `description` for every row; `ARTIST_PUBLIC_COLS` already omits the vector for artists, listings should get the same explicit list.
- `src/hooks/useSaved.ts:42-45` does not invalidate `['feed']` or `['listing', id]`, so `save_count` (the "popular" sort key) is stale in the feed until the next navigation.
- `src/hooks/useMessages.ts:90-99` `useMarkAsRead` invalidates only `['messages', id]`; the inbox list badge (`['unread-counts']`) and `['conversations']` wait for the 30-second poll.
- `src/services/conversations.ts:19` orders `last_message_at DESC`, and Postgres puts NULLs first for DESC, so brand-new empty threads float to the top of the inbox.
- `src/services/analytics.ts:20-59` fires six requests per Trends open; two counts plus the two order reads could be one RPC.
- `src/hooks/usePresence.ts` and `src/components/chat/PresenceIndicator.tsx` have no callers; `getArtistRating`, `useOrder`, `useArtist`, `useArtistReviews`, `useRequesterCommissions`, `useCreateCommission`, `useUpdateCommissionStatus`, `usePostCommissionUpdate`, `useTrackEvent`, `useCreateConversation` are also unreferenced outside their own files (dead, not wrong).
- `src/services/feed.ts:44-46` and `:124-126` run the fallback search only when the strict pass is empty, so a miss costs two queries; `getSearchSuggestions` can cost four per keystroke (debounced, 30 s stale), acceptable.
- `src/app/(public)/artist/[slug]/page.tsx:106-109` resolves pinned ids by a linear `find` over all listings, and `SeriesTabs` filters the full list client-side; both are per-artist bounded and fine at 100 artists.

## Not findings

- N+1 in `services/**`: none. Every list is one PostgREST request with embeds; the only "second query" (`getConversations` commission statuses) is a single batched `.in()`.
- Pagination: the feed and artists feed page with `range(from, from+limit)` and a `limit+1` probe; messages use a keyset cursor on `created_at` with the matching index; notifications cap at 50; reviews on the artist page cap at 20; search suggestions cap at 3 each; featurable/pickable search caps at 8; email fan-out caps at `FAN_OUT_CAP`. These are correct.
- Realtime inventory: any signed-in page opens exactly two channels (`unread-messages`, unfiltered, the P2 above; `notifications`, filtered by `user_id`), and an open thread adds one (`messages:<conversationId>`, filtered). All three are created in effects and removed with `supabase.removeChannel` in the cleanup; deps are `[user, refresh]` / `[conversationId]`, so they resubscribe only on identity change. `alter publication supabase_realtime` covers `messages`, `conversations`, `notifications` only; nothing subscribes to `conversations`. `usePresence` is dead code.
- React Query keys: prefixes are consistent (`['orders', 'buyer'|'artist', id]`, `['reviews', 'artist'|'order', id]`, `['featured', ...]`, `['partner-picks', ...]`), so the broad invalidations (`['orders']`, `['reviews']`, `['featured']`, `['partner-picks']`, `['conversations']`, `['artist']`) hit what they should. `useUnreadCounts` embeds the id array in its key but the array is `useMemo`'d from the conversations query, so the key is stable. `useArtistOrders` is shared by four Studio components and deduplicated. No `refetchInterval` shorter than 30 s; no query invalidates itself in `onSuccess`; no loop found.
- Mutation invalidation on money paths: `useUpdateOrderStatus` and `useConfirmPickup` (on settled, deliberately) invalidate `['orders']`; `approve-refund` invalidates `['orders']` by hand; `useCreateReview` invalidates `['reviews']` and the orders page carries the `reviews(id)` embed plus local state so the button state is right in the same session and the next.
- Convention rule 1 (assert affected rows): every client-side update/delete in `services/**` appends `.select(...)` and checks the row, or carries the required comment where zero rows is legitimate (`setListingTags`, `saveEducation`, `deleteSeries`, `markMessagesAsRead`, `markAllNotificationsRead`). `updateOrderStatus` and `updateCommissionStatus` use `.select().single()`, which errors on zero rows and is surfaced by their `mutateAsync` callers' `try/catch`.
- Column-restricted tables: no bare `select()` or `select('*')` on `profiles` or `artist_profiles` in the read paths; every embed of `profiles` uses `PUBLIC_PROFILE_COLS` with the FK hint.
- Feed RLS cost: the 00033 `listings` policy is `status NOT IN (...) AND EXISTS (artist_profiles by PK)` OR owner OR admin; the admin and owner subqueries are uncorrelated and evaluate once per statement, the `EXISTS` is a PK probe per row. Not a scan multiplier.
- `getFeaturedShelf` and `getPartnerPicksShelf` read entire tables, but those tables are capped by product rules (10 featured, 6 picks per partner), so "unbounded" is not a growth risk there.
- Sequential scans that stay cheap at the stated scale: `artist_profiles` filters (`is_live`, `city ilike`, `neighborhood in`, `school in`) over 100 rows; `commissions` by artist/requester; `artist_education`/photos/videos/series by artist. Listed in the coverage table for completeness, not raised.
- Server-side Supabase calls are `cache: 'no-store'` (`supabase-server.ts`), so no read path serves a stale price or visibility from Next's data cache; the trade-off is that every artist/listing page render hits the database, which the first finding accounts for.
- `getUnreadCounts`, `getBlockedIds`, `getMutedConversationIds` return ids/rows rather than counts, but blocked and muted lists are small per user by nature.
