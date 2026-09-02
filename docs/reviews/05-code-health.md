# Code health — review 2026-09-02

**Files read:**

- Context: `docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`, `docs/SELLER_PROTECTION_SPEC.md` (requirements block, lines 15-60), the finding titles of `docs/reviews/01`-`04` so nothing below repeats them, and the "Not findings" section of `03-frontend.md` (its `.mutate()`/`onError` sweep).
- The 20 largest files in `src/`, in full: `src/app/api/webhooks/stripe/route.ts`, `src/services/email.ts`, `src/components/profile/ArtistProfileEdit.tsx`, `src/components/commission/CommissionPanel.tsx`, `src/app/admin/featured/page.tsx`, `src/app/admin/applications/page.tsx`, `src/app/(auth)/onboarding/artist/page.tsx`, `src/components/studio/SalesSection.tsx`, `src/components/dashboard/GalleryDashboard.tsx`, `src/app/admin/page.tsx`, `src/app/(artist)/listings/[id]/edit/page.tsx`, `src/components/gallery/PartnerPicksManager.tsx`, `src/app/admin/disputes/page.tsx`, `src/app/(artist)/listings/new/page.tsx`, `src/components/feed/ArtFeed.tsx`, `src/app/(user)/account/page.tsx`, `src/components/studio/SetupChecklist.tsx`, `src/app/api/payments/checkout/route.ts`, `src/app/admin/orders/page.tsx`, `src/services/feed.ts`, `src/services/artistContent.ts`.
- `src/services/**` (all 21 files), `src/utils/**` (all 16 source files and 4 test files), `src/schemas/**` (6 files plus the test), `src/types/**` (all 12 files), in full.
- `e2e/**`: `README.md`, `helpers/auth.ts`, and every `test(...)`/`describe(...)` title in all 13 specs; `purchase-refund.spec.ts` and `admin-safety.spec.ts` headers; `playwright.config.ts`; `scripts/run-e2e.sh` lines 55-75; `scripts/nightly-e2e.sh` line 33.
- Read to confirm or kill findings: `src/hooks/{usePartnerPicks,useCommissionUpdates,useOrders,useFeatured,useAnalytics,useReports,useCommissions,useArtist,useConversations,useArtistContent,useReviews,useMessages,useListings,useArtistProfileId,toastError}.ts` in full; `src/app/api/messages/route.ts`, `src/app/api/conversations/[id]/messages/route.ts`, `src/app/api/reviews/route.ts`, `src/app/api/payments/stripe-connect/route.ts` in full; `src/app/api/admin/orders/[id]/refund/route.ts:30-125` (grep of the arithmetic), `src/app/api/artist/submit/route.ts:20-45`, `src/app/api/admin/stats/route.ts` (return sites); `src/components/studio/{ProtectionBadge,PayoutsSection,ReviewStatusBanner}.tsx`, `src/components/chat/{ChatThread,MessageInput,ConversationList}.tsx` (relevant ranges), `src/components/listing/{ReportButton,PurchasePanel,DimensionsFieldset}.tsx` (relevant ranges), `src/components/dashboard/PinnedListingSelector.tsx:35-50`, `src/components/review/ReviewForm.tsx`, `src/components/upload/ImageUpload.tsx:55-80`, `src/components/notification/NotificationDropdown.tsx` and `src/app/notifications/page.tsx` (icon maps), `src/app/(user)/orders/page.tsx` (grep of status map, review and refund paths), `src/app/(auth)/register/page.tsx:40-80,126-132`, `src/app/dashboard/page.tsx`, `src/lib/{publicProfile,resend}.ts`, `next.config.mjs:27-45`.
- Migrations: every `CREATE TABLE` in `00001`, `00002`, `00007`, `00013`; every `ADD COLUMN`/`ADD CONSTRAINT`/`CHECK` across all 48 files (grep, then read in place); `00005`, `00006` (`refresh_completeness_score`), `00009:95-134`, `00012` (reviews policy), `00030:11-15`, `00032:1-30`, `00033:11-19`, `00038:120-175`, `00039`, `00040:1-60`, `00042:1-40`, `00045`, `00047`, `00048` in full.
- Library internals, because two findings depend on them: `node_modules/@supabase/postgrest-js/dist/index.mjs:79-194` (`PostgrestBuilder.then` issues the fetch), `node_modules/resend/dist/index.mjs:650-665` and its error-return sites (the SDK returns `{ data, error }` rather than throwing).

Nothing in scope was skipped.

**Verdict:** The money math, the write-assertion discipline, and the type surface are in better shape than a 24k-line app usually is; the CONVENTIONS sweep clearly landed. What it did not reach is the code that runs *around* the writes: a seller-protection check that measures the wrong thing, an email layer whose failures are structurally invisible, a review path that quietly stopped notifying artists, and a growing layer of dead routes, hooks, and services that still carry stale validation.

---

### P1 — Seller-protection requirement 6 is checked against the 5-day fulfilment window, not the 3-day reply window, and only when the pair's thread happens to be anchored to that exact listing

**Where:** `src/app/api/webhooks/stripe/route.ts:84-88` (passes `fulfillment_window_days` as the reply window), `:26-33` (thread lookup by `context_type = 'listing' AND context_id = listing_id`); `src/utils/evaluateProtection.ts:27-28` (`REPLY_WINDOW_BUSINESS_DAYS = 3`, imported nowhere), `:142-147` (the artist-facing failure text quotes 3 days); `src/services/conversations.ts:82-101` (`findOrCreateConversation` matches on participants only, ignoring context); `src/components/studio/ProtectionBadge.tsx:48-50` (badge hard-codes `artistRepliedWithinWindow: true`, so the webhook is the only evaluator); `docs/SELLER_PROTECTION_SPEC.md:26,35`.

**What happens:** Two paths, same requirement.

1. A buyer writes "any update on shipping?" on a Monday. The artist answers on Friday, four business days later. The spec, the Artist Agreement, and the failure string the artist would be shown all say three business days, so the order is ineligible. The webhook computes `businessDaysBetween(...) > windowBusinessDays` with `windowBusinessDays` = the order's `fulfillment_window_days` (5), so 4 > 5 is false, the requirement passes, and if every other requirement holds the order is stamped `protected`. When the chargeback is lost, the `lost` branch sees `protection_status === 'protected'`, skips the payout reversal, and Custom Canvas absorbs an amount the policy says the artist bears.
2. The buyer and artist already have a thread, created from a different listing or from a commission request (the only creators are `PurchasePanel`, the orders page, and the commissions route, and `findOrCreateConversation` returns whatever thread already exists between the two, regardless of context). The buyer buys listing B and asks about it in that thread. The artist never replies. At dispute time the webhook searches for a conversation with `context_id = B`, finds none, and returns `true`: "no buyer messages at all means there was nothing to answer". Requirement 6 is never evaluated for this pair at all.

**Why it's real:** `REPLY_WINDOW_BUSINESS_DAYS` has zero importers outside its own file (grep across `src/`). The only other `evaluateProtection` caller, the Studio badge, passes a constant `true` for this input, so nothing else ever measures responsiveness. The context-only lookup and the context-blind `findOrCreateConversation` were both read line by line; the webhook's own pickup branch (`:252-257`) already finds the pair's thread by participants alone, which is the lookup this path should have used. This is P1 rather than P0 because money moves only on a lost dispute where the artist was slow but not absent, it is bounded to one payout, and it errs toward the platform paying rather than the artist.

**Fix direction:** Pass `REPLY_WINDOW_BUSINESS_DAYS` into `artistRepliedInTime`, and find the thread by participants (as the pickup branch does), considering only messages created after the order's `created_at`. Then lift `artistRepliedInTime` into `src/utils` as a pure function over a message list so the money tests can pin both rules.

---

### P2 — Every transactional email discards its result; a broken Resend key, an unverified domain, or a suspended account produces no signal anywhere

**Where:** `src/services/email.ts:32-45` and every other single-send function (`sendOrderConfirmationEmail`, `sendNewSaleEmail`, `sendShippingUpdateEmail`, `sendReviewReceivedEmail`, `sendCommissionRequestEmail`, `sendCommissionUpdateEmail`, `sendCommissionNudgeEmail`, `sendReviewRequestEmail`, `sendArtistApprovedEmail`, `sendArtistRejectedEmail`, `sendAdminPasswordResetEmail`, `sendNewMessageEmail`, both drips): each does `await getResend().emails.send({...})` and never reads the returned `{ error }`. Only `sendBulkEmails` (`:415-426`) checks it. The call sites then add a second layer of silence: `src/app/api/webhooks/stripe/route.ts:286,297`, `src/app/api/orders/[id]/notify-shipped/route.ts:41` (and `src/services/orders.ts:46` around the fetch that calls it), `src/app/api/commissions/route.ts:88`, `src/app/api/commissions/[id]/updates/route.ts:72`, `src/app/api/cron/onboarding-drips/route.ts:47,71`, `src/app/api/cron/review-reminders/route.ts:35`, `src/app/api/cron/commission-nudges/route.ts:41`, `src/app/api/reviews/route.ts:106` — all `.catch(() => {})`. `src/lib/resend.ts:7-12` constructs the client with whatever `RESEND_API_KEY` is, including `undefined`.

**What happens:** The Resend key is rotated in the Resend dashboard but not in Vercel (the boot-time check at `email.ts:5-7` guards `EMAIL_FROM`, not the key). Every buyer who pays gets no order confirmation. Every artist gets no "you made a sale" email and, unless they open Studio, ships late; the fulfilment window is five business days, so the same outage that hid the sale also makes the order ineligible for protection. Shipping notices, review requests, commission requests, drips and admin password resets all stop. Sentry receives nothing, because the Resend SDK returns `{ data: null, error }` (verified in `node_modules/resend/dist/index.mjs`, which builds error objects at six return sites rather than throwing) and no single-send reads it. The e2e suite has no mail sink, so the nightly stays green. Discovery is a tester saying "I never got an email", which is how the round-1 and round-2 tester feedback was gathered.

**Why it's real:** I read all fourteen template functions and all ten call sites. The bulk path shows the authors know the SDK's shape (`const { error } = await resend.batch.send(...)`); the single path predates it and was never brought in line. The `.catch(() => {})` wrappers would have swallowed a thrown error anyway, so there are two layers of silence, and neither reaches Sentry or the user.

**Fix direction:** In `email.ts`, read `{ error }` from every `emails.send` and either throw or `Sentry.captureMessage` with the template name, mirroring `sendBulkEmails`. At the call sites, replace `.catch(() => {})` with `.catch((e) => Sentry.captureException(e))`, which `src/app/api/messages/route.ts:66` already does for its fan-out.

---

### P2 — A buyer's review never reaches the artist: the notifying API route has no callers, and the client-side insert that replaced it sends nothing

**Where:** `src/app/(user)/orders/page.tsx:34,46` → `src/hooks/useReviews.ts:20-29` → `src/services/reviews.ts:4-23` (direct `supabase.from('reviews').insert`). The route that emails the artist, `src/app/api/reviews/route.ts:25-111`, is not fetched from anywhere in `src/` (grep for `api/reviews` finds only the rate-limit map in `src/middleware.ts:12`). No migration creates a `review_received` notification (grep across `supabase/migrations`: the type appears only in CHECK constraint lists), and no code in `src/` inserts one; `src/types/notification.ts:14` and both icon maps still carry the type.

**What happens:** A buyer confirms delivery and leaves a five-star review with a comment. The row lands (the `00012` RLS policy enforces owner + `delivered`; the UNIQUE on `order_id` enforces one per order). The artist receives no email, no in-app notification, and nothing in Studio; they find out only if they open their own public page. The e2e `purchase-refund` step "buyer reviews" asserts the buyer side only, so this has been the shipped behaviour through both tester rounds.

**Why it's real:** The client path and the server path are two independent implementations of the same write. The server one carries the email and the duplicate 409; the client one carries neither. I checked for a DB trigger that might fill the gap the way `00047` does for follows: there is none. `sendReviewReceivedEmail` is therefore dead code in practice, and `review_received` is a notification type nothing produces.

**Fix direction:** Make `useCreateReview` call `POST /api/reviews` (the service's `listingApi` helper pattern in `src/services/listings.ts:25-35` is the template), or add a `reviews` AFTER INSERT trigger that writes the `review_received` notification and leave email to the route. Delete whichever write path is not chosen.

---

### P2 — "Connect with Stripe" fails silently on the client, and the route has no error handling at all

**Where:** `src/components/studio/PayoutsSection.tsx:22-29` (`catch { setConnecting(false); }`), `src/services/payments.ts:1-10` (throws a generic string on any non-2xx), `src/app/api/payments/stripe-connect/route.ts:23-52` (no try/catch around `accounts.create`, the row write, or `accountLinks.create`; the `update` at `:41-45` is unchecked). `DECISIONS.md` "2026-08-21 — Stripe Connect stays on Accounts v1" records that live-mode `accounts.create` under the v1 compatibility flag has not been exercised.

**What happens:** An artist clicks Connect with Stripe. `accounts.create` rejects (the DECISIONS-flagged live-mode v1 case, a Stripe outage, or a 429). The route throws, Next returns a 500, `createStripeConnectLink` throws "Failed to create Stripe Connect link", and `PayoutsSection` catches it and only clears the spinner. The button returns to its idle state. No toast, no message, no `captureException` from the client. The artist clicks again, sees the same nothing, and concludes the feature is broken. The variant where `accounts.create` succeeds and the row `update` fails is the orphaned-account case the money review already filed as its P3; this finding is the user-facing half.

**Why it's real:** This is a bare `catch {}` around a server write and a `.mutate()`-equivalent with no error path to the user, which `docs/CONVENTIONS.md` rule 2 bans. The 03 review's sweep listed every mutation hook and missed this one because it is a hand-rolled `fetch`, not a `useMutation`. I checked whether the Studio route wraps it in an error boundary that would show something: the fetch is inside an event handler, so no boundary is involved.

**Fix direction:** Toast the route's `error` string and `captureException` in the `catch`, matching `SalesSection.handleApproveRefund`. In the route, wrap the Stripe calls, return a 502 with a plain message on failure, and assert the row write.

---

### P3 — Five `supabase.rpc('refresh_completeness_score')` calls are never sent: an un-awaited PostgREST builder does nothing

**Where:** `src/app/(artist)/listings/new/page.tsx:91`, `src/components/profile/ArtistProfileEdit.tsx:143,155`, `src/components/profile/PersonalPhotoUploader.tsx:34,56`. Mechanism: `node_modules/@supabase/postgrest-js/dist/index.mjs:79-85`, where `PostgrestBuilder.then()` is what calls `_fetch`; a builder that is never awaited or `.then`'d never issues a request. The three awaited callers (`ArtistProfileEdit.tsx:185`, the webhook `:580`) do run.

**What happens:** A new artist uploads an avatar (10 points), a banner (5), two personal photos (5) and publishes a first listing (20). None of those four refreshes execute. `artist_profiles.completeness_score` stays at whatever the last profile "Save Changes" or Stripe `account.updated` wrote, and the Studio home's "Profile Completeness" card (`src/app/(artist)/studio/page.tsx:67`) shows, say, 30% next to an editor bar that computes 70% locally. Nothing gates on the column (I read `src/app/api/artist/submit/route.ts:37-45`: it checks avatar, story and listing count directly), so the damage is a wrong number, not a blocked flow.

**Why it's real:** The laziness is by design in supabase-js v2 and is verified in the installed build (2.99.1). The five sites are statement-position calls with no `await`, `void`, `.then` or assignment. The hazard beyond the stale number is the pattern: the next person who copies `supabase.rpc(...)` or `supabase.from(...).update(...)` without an `await`, for a write that matters, loses the write with no error.

**Fix direction:** `await` (or `void`-with-`.then`) all five and treat the result like any other write. A one-line ESLint rule (`@typescript-eslint/no-floating-promises` on `PostgrestBuilder` thenables) would have caught all five; adding it is the durable fix.

---

### P3 — Seven hand-rolled copies of the own-artist-row lookup that `useOwnArtistProfile` was written to replace, each swallowing the error differently

**Where:** `src/hooks/useArtistProfileId.ts:22-43` is the canonical, cached hook (its docstring: "replaces the per-page useEffect lookups the old console pages each hand-rolled"). Still hand-rolled: `src/app/(artist)/listings/new/page.tsx:40-49`, `src/app/(artist)/listings/[id]/edit/page.tsx:34-41`, `src/components/dashboard/HoustonVerifiedCard.tsx:25`, `src/components/dashboard/AwayModeToggle.tsx:22`, `src/components/profile/ArtistProfileEdit.tsx:75`, `src/components/layout/ArtistSetupGuard.tsx:41-43`, plus the onboarding guard at `src/app/(auth)/onboarding/artist/page.tsx:102-106` (legitimate: it runs before a row exists).

**What happens:** The copies have already diverged: four use `.single()` (an error on zero rows, which every `.then(({ data }) => ...)` handler ignores), two use `.maybeSingle()`, and they select four different column lists. None uses `withSessionRetry`, although `listings/new` is the first page an artist reaches after onboarding, exactly the "near signup" case CONVENTIONS rule 3 covers. Concretely: a pickup-only artist lands on `/listings/new` moments after onboarding, the lookup runs before the session cookie is attached, RLS returns zero rows, `.single()` errors, the handler ignores it, `isPickupOnly` stays `false`, and the form shows a Shipping rate field the artist fills in. Checkout recomputes shipping from `artist.fulfillment_pref` (`checkout/route.ts:74-75`) so no money is wrong, but the listing carries a `shipping_rate_cents` the artist thinks buyers pay.

**Why it's real:** `GalleryDashboard.tsx:80-81` records the previous time this class bit: `00033`'s column privacy turned a bare `select('*')` into a 42501 that "left this search permanently empty". Any future grant change on `artist_profiles` has to be discovered seven times, and because every copy discards `error`, each discovery is a silent wrong default rather than a failure.

**Fix direction:** Route the six Studio-side copies through `useOwnArtistProfile` (extend its column list with `fulfillment_pref`, `is_houston_verified`, `away_*` once) and delete the effects. Leave the onboarding guard as is.

---

### P3 — Dead routes, hooks and services that still carry their own validation and write paths

**Where:**
- API routes with no callers in `src/`: `src/app/api/conversations/route.ts` (POST, `createConversationSchema`), `src/app/api/conversations/[id]/messages/route.ts` (GET and POST, `sendMessageSchema`). Review 02 already listed `/api/listings` and `/api/artists` GET.
- Hooks with no importers outside `src/hooks/`: `useUpdateCommissionStatus`, `useCreateCommission`, `useCreateConversation`, `useTrackEvent`, `useOrder`, `useOrderReview`, `usePostCommissionUpdate`, `useRequesterCommissions`, `useArtistReviews`, `useVideos`.
- Service functions with no importers: `commissions.{createCommission, updateCommissionStatus, getCommissionById}`, `commissionUpdates.postCommissionUpdate`, `reports.{reportMessage, getReports}`, `reviews.{getReviewsByArtist, getArtistRating}`, `messages.getAttachments`, `listings.getListingImages`, `artistContent.{addVideo, updateVideo, deleteVideo}`.
- UI: `src/components/profile/ArtistProfileEdit.tsx:305-308` renders a "Videos" `<fieldset>` containing only its `<legend>`; the artist sees a section heading with nothing under it.

**What happens:** The dead message route is the one that matters: its `sendMessageSchema` (`src/schemas/messageSchema.ts:3-7`) allows `text | image | listing_card | quote_card`, which is the `00001` enum, not the `00045` one; it skips the attachment insert, the preview text, and the email fan-out that the live `/api/messages` performs; and it is reachable by any signed-in user at a rate limit of 60/min. Nothing calls it today, so nothing is broken today. The next developer who greps for "send message" finds two routes and two schemas and has to work out which is real. The dead `commissions.updateCommissionStatus` looks like a client-side state-machine bypass, but `00009:128` dropped the user UPDATE policy on `commissions`, so it would be a zero-row no-op rather than a hole; it is dead, not dangerous.

**Why it's real:** Every "no callers" claim above is a grep across `src/` and `e2e/` for the identifier, excluding its defining file and test files; the hook and service counts were produced by script, then spot-checked (`CommissionUpdates.tsx` posts via `fetch` to `/api/commissions/[id]/updates`, not through the hook; the artist page reads reviews with its own query at `artist/[slug]/page.tsx:76`, not through `getReviewsByArtist`).

**Fix direction:** Delete the two conversation routes, the ten hooks, the twelve service functions, `sendMessageSchema`/`createConversationSchema`, and the empty Videos fieldset in one commit; keep `useArtistAnalytics` and `getArtistAnalytics`, which are live. Then the message-type enum only has to be right in one place.

---

### P3 — Zod schemas and TS types that disagree with what the database enforces (every disagreement I found)

**Where / what:**

1. `src/schemas/messageSchema.ts:6` — `message_type` enum lacks `file` and `system`; `00045` allows both. Only the dead route above uses it.
2. `src/types/message.ts:1` — `MessageType` lacks `file`, yet `ChatThread.tsx:64-71` sends `message_type: 'file'` (typed away by `sendMessage`'s `message_type?: string`), and `00045` accepts it. The one runtime consequence: `src/app/api/messages/route.ts:10` `EMAILABLE` was written from the old enum and omits `file`, so a PDF sent as the first unread message triggers no "new message" email while a photo does. A buyer who opens a conversation by attaching a brief gets no reply until the artist happens to log in.
3. `src/schemas/artistSchema.ts:11` — `graduation_year` max is a literal `2030`; the column has no CHECK. A student on a five-year programme who enrolled this month (2026) cannot save 2031, and the form's error toast names the field without saying why.
4. `src/schemas/listingSchema.ts:31,63` — `year_created` max is `new Date().getFullYear()` evaluated once at module load. A client bundle built in December, or a server instance that has been warm across midnight on 31 December, rejects the new year until redeploy. Cheap to fix (`z.number().refine`), cheap to hit once a year.
5. `src/types/report.ts:13` — `listing_id: string`, but `00013:65` dropped NOT NULL and conversation/user reports store `null`. The one reader (`admin/disputes/page.tsx:140`) guards on it, so nothing breaks; the type is simply wrong.
6. `src/types/user.ts:5` — `Profile.email: string`, but `00031` makes `email` service-role-only and `PUBLIC_PROFILE_COLS` never selects it, so on the client it is always `undefined`. `ConversationList.tsx:48,52` falls back to `other.email` for users without a name; Full Name is `required` at signup so the branch is dead rather than visible.
7. `src/types/artist.ts:19,22,26,28` — `city`, `commissions_open`, `accent_color`, `bio_layout` are typed non-null; the columns are nullable with defaults. Every insert path (onboarding) sets all four, so no runtime path produces a null; the types are aspirational, not enforced.
8. `src/types/order.ts:3-9` — `ShippingAddress` omits `name`, which `src/utils/orderRecord.ts:79` deliberately stores ("captures the recipient NAME, which the app's own form never collected"). Because the type omits it, no UI reads it: `SalesSection.tsx:134-140` prints street, city, state and zip and never the recipient. The artist prints a label without a name unless they ask the buyer.
9. `src/schemas/listingSchema.ts:56-73` — `listingWriteSchema` has no `artist_id` or `is_featured`, and Zod strips them, while `createListing`'s parameter type (`services/listings.ts:37`) requires both and `listings/new/page.tsx:81-82` sends them. Harmless, but the client type promises the server something it discards.

Agree with the DB and were checked: `OrderStatus`, `protection_status`, `dispute_outcome`, `carrier` values; `CommissionStatus` and `closed_by`; all 21 `NotificationType` members (and both icon maps have all 21); `PartnerType` versus `partner_type_enum`; `ReportReason`/`ReportStatus`; `ListingStatus` versus the `00005` CHECK; the AI-disclosure rule versus `00042`; `reviewSchema` versus the `rating` CHECK; `AttachmentType`.

**Fix direction:** Items 2 and 8 change behaviour and deserve their own one-line fixes (`EMAILABLE.add('file')`; render `shipping_address.name`). The rest are a single pass over the two type files and two schema files, done when item 7's tables next change.

---

### P3 — Two `.mutate()` chains have no `onError` anywhere (CONVENTIONS rule 2), beyond the two review 03 found

**Where:** `src/components/listing/ReportButton.tsx:33-36` with `src/hooks/useReports.ts:4-8`; `src/components/chat/ChatThread.tsx:30-36` with `src/hooks/useMessages.ts:90-99`.

**What happens:** A signed-in user reports a listing; the `reports` insert fails (RLS on a stale session, or a network drop). The button's spinner ends, the modal stays on the form, and nothing is said or logged; the user assumes it went through. Second: opening a thread fires `markAsRead`; if the `messages` update matches zero rows or errors, the unread badge in the inbox and navbar never clears for that thread, with no signal to the user or Sentry.

**Why it's real:** Both hooks were read: neither has `onError`; both call sites pass options without `onError`. The 03 review's "Not findings" list of hooks called with per-call `onError` or `mutateAsync` does not include `useCreateReport` or `useMarkAsRead`.

**Fix direction:** Add `onError: toastError(toast, 'useCreateReport')` to the hook, matching `useListings.ts`. For `useMarkAsRead`, a toast would be noise; `captureException` in an `onError` satisfies the "reaches someone" half of the rule.

---

### P3 — Where a bug would be silent and expensive, and no test would notice

**Where:** `vitest.config.ts` includes `src/**/*.test.ts`; the five existing suites cover `commissionCalc`, `orderRecord`, `evaluateProtection`, `listingPriceLabel`, and the listing schema's AI rule. `scripts/run-e2e.sh:60-62` runs ten specs on `--project=chromium`; `purchase-refund` runs only with `E2E_MONEY=1`, which `scripts/nightly-e2e.sh` does not set; `critical-paths` is not in the list at all.

**What is not covered, ranked by cost of a silent bug:**

1. The webhook's `charge.dispute.created/closed` and `charge.refunded` branches: no unit test (the handler is not factored to allow one) and no e2e (a dispute cannot be triggered from the browser). The money review found two P1s in exactly these branches; this pass found the P1 above in the same file. A regression here costs a payout per incident.
2. `artistRepliedInTime` (webhook `:17-57`): pure logic over a message list, decides money, zero tests, and wrong today.
3. The admin refund arithmetic (`admin/orders/[id]/refund/route.ts:43-48`): tax proration by `Math.round` on the fee share, returned to buyers. Reviewed by hand in 04; pinned by nothing.
4. `isSafeInternalPath` (`src/utils/safePath.ts`): the open-redirect guard for login and auth callback; a regex edit reopens `//evil.com` with no test failing.
5. `cmToIn`/`inToCm`/`toCm` (`src/utils/dimensions.ts`, `DimensionsFieldset.tsx:41-50`): the edit page's comment records a 2.54× shrink bug that once shipped; nothing pins the round-trip.
6. `calculateCompletenessScore` versus the SQL `refresh_completeness_score`: the same eleven weights implemented twice (TS and plpgsql), with no test that they agree, and the P3 above already shows them drifting in practice.
7. E2E blind spots: the Playwright `mobile` project exists in config but never runs (review 03's mobile filter-drawer P2 lives there); account deletion is tested only for a user with no orders (review 01's P0 lives on the untested branch); no spec asserts an email was sent (finding 2 above is invisible to the suite); the four cron routes, the bulk listing/price-drop alerts, `/unsubscribe`, the two-sided pickup handoff, and the oversell auto-refund have no coverage.

**Fix direction:** Extract the two webhook helpers (`artistRepliedInTime`, and the `dispute.closed` branch selection) into `src/utils` as pure functions and test them alongside `evaluateProtection`. Add `safePath`, `dimensions`, and a "TS score equals SQL score" fixture test. Set `E2E_MONEY=1` in the nightly and add `--project=mobile` for `visitor.spec.ts`.

---

## Appendix: minor

- `src/app/api/webhooks/stripe/route.ts:238,361,375,408,500,513`: six `orders`/`listings` status updates are `await`ed with no error check, then the handler returns 200, so Stripe never retries; a failed `status: 'refunded'` write at `:361` leaves a `paid` order whose listing was just relisted at `:375`.
- `src/app/admin/page.tsx:71-81`: `fetch('/api/admin/stats').then((r) => r.json())` with no `ok` check; a 401/403 body (`{ error }`) reaches `stats.total_users.toLocaleString()` and crashes the dashboard to the error boundary instead of a message.
- Order status badge maps are copied three times (`SalesSection.tsx:20-27`, `(user)/orders/page.tsx:20-26`, `admin/orders/page.tsx:29-36`); typed as `Record<OrderStatus, …>` so they cannot silently miss a status, but the labels already differ (admin shows raw `o.status`).
- Admin fan-out ("select admins, insert notifications") is copied four times (webhook `:345-354`, `:431-451`, `:523-534`; `approve-refund/route.ts:44`) with two shapes (loop of single inserts vs. one batch insert) and one semantic reuse (`refund_approved` as the type for an admin "refund needs attention" alert at webhook `:349`).
- The strict-then-prefix search fallback is implemented three times in `src/services/feed.ts` (`:40-48`, `:122-128`, `:169-188`) with different fallback triggers (page 0 empty with no next page vs. both suggestion lists empty).
- `src/services/featured.ts` and `src/services/partnerPicks.ts`, their hooks, and `admin/featured/page.tsx` vs `PartnerPicksManager.tsx` are near-identical pairs (`searchFeaturableListings` ≡ `searchPickableListings`; both `handleMove` bodies are the same 20 lines). Two copies, not three, so listed here.
- `src/utils/evaluateProtection.ts:75-93`: `businessDaysBetween` normalises to UTC midnight, so a Houston 7 pm message counts as the next day; the window is a floor, so this only ever costs the artist up to one day.
- `src/services/email.ts:5-7`: the boot-time `EMAIL_FROM` throw is imported by the Stripe webhook route, so a missing env var in production 500s every webhook (Stripe retries for three days). Deliberate ("must be loud"); noted because the blast radius includes order creation.
- `src/utils/formatPrice.ts:1-6`: a non-integer `cents` renders as `$12.34.5`; no current caller passes one (all cents are `Math.round`ed or Stripe integers).
- `src/services/orders.ts:46` fires `/api/orders/[id]/notify-shipped` without awaiting inside a function whose caller then toasts "Order marked as shipped!"; covered by finding 2, listed here because the buyer's shipping email is the one artists will be asked about.

## Not findings

- `buildOrderRecord`'s `JSON.parse(shippingRaw)` (`orderRecord.ts:130`): the metadata is written only by `checkout/route.ts` from a Zod-validated object whose maximum serialised length (~300 chars) is under Stripe's 500-char metadata cap, so it cannot be truncated or malformed.
- The `lost`-branch reversal in the webhook (`:479-497`) is idempotency-keyed on the dispute id and re-checked on `stripe_reversal_id`, so a failed row write after a successful reversal is safe on retry.
- `updateOrderStatus` and `updateCommissionStatus` use `.select().single()`, which turns an RLS zero-row result into a thrown PGRST116 that `SalesSection` toasts; compliant with CONVENTIONS even without `maybeSingle`.
- Every other `.mutate()` call site (`admin/featured`, `PartnerPicksManager`, `PinnedListingSelector`, `PurchasePanel`, `orders` page refund request and pickup confirm, `SalesSection` pickup confirm, `ThreadMenu`, `NotificationDropdown`, `notifications` page, `FeedCard`, `ArtistBrowseCard`, `ProfileHero`, `ListingsSection`, `ChatThread.sendMessage`) has `onError` at the call site or `toastError` in the hook.
- `MessageInput.handleFile` and `ImageUpload` surface failures and reach Sentry; the `p.catch(() => {})` at `ImageUpload.tsx:71` only absorbs already-abandoned sibling uploads after the real error is thrown.
- `register` `handleResend` `catch {}` sets a `failed` state the user sees; `ReviewStatusBanner` and `SetupChecklist` swallow only read failures with a safe default.
- `src/utils/listingVisibility.ts` matches the `00033` policy exactly (`status NOT IN ('hidden','draft') AND artist is_live`).
- `getFeaturedShelf` and `getPartnerPicksShelf` "fail soft to empty" on the homepage by design and say so.
- `services/reviews.createReview` relies on RLS for owner + `delivered` and on the UNIQUE for one-per-order; both are enforced in `00012`/`00001`, so the client insert is not a security hole (only a notification hole, finding 3).
- `commissionDisplayStatus` is exhaustive over `CommissionStatus`; `TYPE_ICONS` maps are complete over all 21 notification types.
- The `any` count in `src/` is zero; non-null assertions are confined to env-var reads in `src/lib/*` and `user!.id` inside `enabled: !!user` query functions.
- `escapeHtml`/`plain` are applied to every user-supplied value interpolated into an email template; `actionLink` and `conversationUrl` are server-built.
- `withSessionRetry` is used at the two writes closest to signup (`onboarding/artist` insert, `updateArtistProfile`), as CONVENTIONS rule 3 requires; the un-retried lookups are reads (finding 6).
- `commissionRequestSchema`, `commissionQuoteSchema`, `galleryProfileSchema`, `reviewSchema`, and the checkout `shippingSchema` are strictly tighter than their columns; no value they accept is rejected by the DB.
