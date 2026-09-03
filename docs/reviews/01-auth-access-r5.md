# Accounts, auth & access control — review 2026-09-03 (r5)

**Files read:**
Context — `docs/CONVENTIONS.md`, `README.md`; `docs/reviews/01-auth-access-r4.md` (in full),
`01-auth-access-r3.md`, `01-auth-access-r2.md`, `04-money-r5.md`, `04-money-r6.md` (headings and
every section overlapping this scope, to avoid re-reporting); `git show --stat HEAD`, `HEAD~2`,
and the full `src/lib/acceptance.ts` diff in `HEAD`.

Scope — `src/lib/acceptance.ts`, `src/app/api/account/acceptance/route.ts`,
`src/services/acceptance.ts`, `src/components/legal/AcceptanceInterstitial.tsx`; all 13
`acceptanceGateFor` call sites (`payments/checkout`, `listings` POST, `listings/[id]` PATCH,
`messages`, `reviews`, `commissions` POST and the seven `commissions/[id]/*`);
`src/app/api/orders/[id]/{return-shipped,cancel-unshipped,propose-ship-by,accept-ship-by,
concede-dispute,approve-refund}/route.ts`;
`src/app/api/admin/orders/[id]/{signature-confirmed,return}/route.ts`;
`src/app/api/admin/dmca/route.ts`, `src/app/admin/dmca/page.tsx`;
`src/lib/maturePreference.ts`, `src/context/MatureContext.tsx`, `src/services/{feed,featured,
partnerPicks,listings,messages,conversations,commissionUpdates}.ts`, `src/hooks/{useOrderReturn,
useListings}.ts`, `src/components/artist/SeriesTabs.tsx`;
migrations `00058`, `00059`, `00063`, `00064`, `00065`, `00066` (read), `00067`, `00068`;
`scripts/db-smoke.sql` §9–§16.

Read as callers/context — `src/app/api/account/delete/route.ts`, `src/app/api/artist/submit/route.ts`,
`src/app/(auth)/onboarding/artist/page.tsx`, `src/app/(artist)/listings/[id]/edit/page.tsx` and
`.../new/page.tsx`, `src/components/listing/AboutPieceFieldset.tsx`, `src/schemas/listingSchema.ts`,
`src/components/studio/SalesSection.tsx`, `src/app/(user)/orders/page.tsx`,
`src/app/api/admin/users/route.ts`, `src/app/api/conversations/route.ts`,
`src/lib/{orderReturns,settleRefund,signedUpload}.ts`, `src/utils/{fulfillment,fulfillmentWindow}.ts`,
`src/app/api/webhooks/stripe/route.ts` (the refund/relist block), and migrations `00001`, `00002`,
`00006`, `00009`, `00012`, `00023`, `00030`, `00032`, `00037`, `00038`, `00049`, `00052`, `00056`.

Nothing in scope was skipped. Nothing was executed against a database this pass — every claim
below is from the source. Where that limits a claim I have said so.

**Verdict:** The acceptance half of this arc is solid and I could not forge a stamp from any
direction: both halves of the record are server-written, the gate sits before the work in all 13
routes, and the r4 fixes closed their loops without opening new ones (`outstandingAcceptances`
keying on *having* an artist profile is the right key, and it makes the interstitial the exit it
was missing). The DMCA half is still the weak one — 00068 moved the files but the quarantine
record is keyed to the wrong row and its removal reports success whether or not anything moved —
and outside the acceptance code the biggest thing this arc shipped is a listing edit route that
silently drops every field L4 added, including the mature flag the whole D8 filter depends on.

---

### P1 — The listing edit route silently drops all seven fields L4 added, including `is_mature`: the artist marks a nude as mature, sees "saved", and it stays in everyone's default feed

**Where:** `src/app/api/listings/[id]/route.ts:53-60` (the `EDITABLE` allowlist and the copy loop);
`src/app/(artist)/listings/[id]/edit/page.tsx:111-139` (the submit body);
`src/components/listing/AboutPieceFieldset.tsx:54-115` (the inputs);
`supabase/migrations/00059_listing_standards_fields.sql:22-29` and `:44-46`.

**What happens:** The edit form renders and validates every L4 field — `edition_type`,
`edition_size`, `edition_number`, `is_signed`, `condition_notes`, `handling_notes`, `is_mature` —
and `onSubmit` sends all seven in the PATCH body. The route parses them with
`listingWritePatchSchema` (they are all in `listingWriteObject`, so they survive the parse) and
then copies only the sixteen keys named in `EDITABLE` into `updates`. None of the seven is in that
list. The `.update(updates)` succeeds, returns the row, `useUpdateListing`'s `onSuccess` fires, and
the page redirects to `/studio/work` with no error anywhere.

Concretely: an artist is told their nude has to be tagged (Listing Standards Part three), opens the
listing, ticks "Nudity or mature themes", is forced by the schema to also type ≥10 characters of
condition notes before the form will submit, presses Save, and is returned to Studio as if it
worked. `listings.is_mature` is still `false`, so the piece stays in `getFeed`
(`services/feed.ts:93`), the home shelves (`featured.ts:18`), the partner picks
(`partnerPicks.ts:29`) and the artist grid (`SeriesTabs.tsx:35`) for every visitor who has not
opted in — which is all of them by default. The same save silently discards a change from
`original` to `reproduction`, so a print keeps being described as an original.

**Why it's real:** I looked for another writer of these columns on the edit path and there is none.
`onSubmit` calls exactly two things — `updateListing` (which is `listingApi(... PATCH /api/listings/[id])`,
`services/listings.ts:48-53`) and `setListingTags` (tags only). A grep for `from('listings')` under
`src/components`, `src/app/(artist)` and `src/app/studio` finds three call sites and all three are
selects. The admin listing route is admin-only and is not this path. The create path is not
affected — `POST /api/listings` inserts `{...parsed.data}` wholesale
(`src/app/api/listings/route.ts:37`), so the fields work on a new listing and only on a new
listing, which is exactly the asymmetry that hides this. And 00059's own comment states the
intent this breaks: *"The schema requires it for NEW listings only; an artist editing an old one
is asked for it then."* They are asked, and the answer is thrown away.

This is `docs/CONVENTIONS.md`'s founding disease with the location changed: not an RLS refusal
swallowed client-side, but a server-side allowlist drop with a 200 on top. The rule's spirit —
"silence is what this rule bans" — is violated even though the letter is about supabase-js writes.

**Fix direction:** Add the seven columns to `EDITABLE` (they are artist-owned content columns;
00059's own comment says "the client may read and write them under the existing table-level
grants", and there is no column guard to fight). Then make the drop impossible to repeat silently —
have the route 400 when the parsed body contains a key that is neither in `EDITABLE` nor a known
non-column, so the next column added to the form fails loudly instead of vanishing.

---

### P1 — Marking a DMCA notice withdrawn or defective *after* the material was removed strands the listing permanently: there is no restore button for those states, and the API path is shut for 10 business days

**Where:** `src/app/admin/dmca/page.tsx:238-266` (which buttons exist per status);
`src/app/api/admin/dmca/route.ts:256-270` (restore's earliest-date gate), `:321-324` (withdraw /
defective are a bare status stamp); `supabase/migrations/00067_acceptance_and_dmca_hardening.sql:97-111`
(`guard_listings_update`) and `:64-77` (`guard_listings_delete`).

**What happens:** The normal sequence is: notice logged (`received`) → admin presses **Remove
material** → the listing goes `hidden`, `dmca_removed_at` is stamped, the images move to
`dmca-quarantine`, the notice becomes `material_removed`. The card for a `material_removed` notice
offers three buttons: *Counter-notice received*, *Withdrawn*, *Defective*
(`page.tsx:249-261`). The last two are entirely reasonable next steps — the claimant emails to
withdraw, or the admin works out the notice was missing required elements — and both are a plain
`UPDATE dmca_notices SET status = ...` that touches the listing not at all.

The notice is now `withdrawn` (or `defective`). No branch in the card matches those statuses, so
the card renders with **no buttons at all**, for ever. The listing is still `hidden` with
`dmca_removed_at` set, which means the artist cannot change its status
(`guard_listings_update` raises) and cannot delete it (`guard_listings_delete` raises) — the
message they get tells them to write to support, and support's own tool has no control that can
help them. Their images are in a private bucket. The piece is unsellable and undeletable.

The API is not a real escape hatch either. `PATCH { action: 'restore' }` has no status
precondition so it would work — but its first gate is
`now < addBusinessDays(notice.received_at, 10)`, measured from the *notice*, so for the fortnight
after a notice arrives even a hand-crafted request is refused; and after it opens, the restore
still cannot bring the images back (see the next finding).

**Why it's real:** I tried to argue that withdraw/defective are only meant for a notice that has
not been acted on. They are not: the card offers them on `material_removed` explicitly, and the
confirm text on *Withdrawn* is "A withdrawn notice does not count toward repeat infringement" —
it talks about the count, not about the listing, because nobody considered the listing. I also
checked whether logging a *fresh* notice on the same listing reopens the path: it does (a new
`received` row gets the full button set), but that row has no `quarantined_paths`, so the listing
would come back imageless. The one thing that does still work is that the removal cannot be
undone by accident — the freeze is doing its job; the gap is that nothing in the product can
undo it on purpose.

**Fix direction:** Show the *Restore* button whenever `listing.dmca_removed_at` is set, not only
on `counter_received`, and let the route distinguish two restores: a §512(g) counter-notice
restore, which keeps the 10-business-day gate, and a plain reversal (withdrawn / defective /
admin error), which has no waiting period because §512(g) does not apply to it. The second is
also the honest answer for a claimant who withdrew.

---

### P2 — The quarantine record lives on the notice row, so any restore that is not the exact row that removed the material republishes the listing with its images still locked away

**Where:** `src/app/api/admin/dmca/route.ts:247-253` (`quarantined_paths` written onto the notice
that removed the material), `:306-307` (read back from `notice.quarantined_paths`), `:271-302`
(the listing is restored regardless), `:175` (a notice logged with `kind: 'counter_notice'` is
created straight into status `counter_received`); `src/app/admin/dmca/page.tsx:177-188` (the Kind
selector) and `:262-266` (Restore appears on any `counter_received` row);
`supabase/migrations/00068_dmca_execute_and_quarantine.sql:42-46`.

**What happens:** The log form has a Kind selector with "Counter-notice" as an option, and the POST
gives such a row `status = 'counter_received'` — so logging the counter-notice as its own record
is a first-class supported flow, and an admin filling that form naturally pastes the same
`listing_id`. That new row immediately shows a **Restore** button.

Pressing it: the route reads the *listing*, so `pre_dmca_status` is there and the piece correctly
goes back to `available`; it clears `dmca_removed_at` and `pre_dmca_status`; then it reads
`notice.quarantined_paths` **from the row it was called on**, which is `NULL` on the counter-notice
row. `paths` is `[]`, `restoreImages` never runs, and the response says `images_restored: 0` —
which the page ignores, toasting "Done." The listing is live again with every image URL pointing
at an object that was deleted from `listing-images`. Buyers see a card with no picture; the
artist's own Studio shows a broken listing.

It also poisons the correct row: `pre_dmca_status` has now been set to `NULL` on the listing, so
if the admin later runs the real sequence on the original notice (*Counter-notice received* →
*Restore*), that restore puts the images back and simultaneously sets the listing to `hidden`,
because `listing?.pre_dmca_status ?? 'hidden'` no longer has a value to fall back on.

**Why it's real:** I checked for a link between a counter-notice row and the notice it answers and
there is none — 00065's table has no parent column and nothing correlates them but
`subject_profile_id` / `listing_id`. So the route has no way to find the paths from any row but
the one that wrote them, and nothing stops Restore being pressed on the wrong one. The innocent
reading — that admins are expected to use the *Counter-notice received* button on the original row
rather than log a second row — is contradicted by the form offering the option and by the POST
having a branch specifically for it.

**Fix direction:** Move the quarantine record to the thing it describes — a
`listings.dmca_quarantined_paths` column (it is the listing's images, not the notice's), so any
restore path finds them. Failing that, resolve the paths at restore time by
`listing_id` across notices in `material_removed` state, and refuse a restore whose listing has
`dmca_removed_at` set but whose paths cannot be found, rather than publishing an imageless piece.

---

### P2 — "Remove material" reports success and stamps `material_removed` even when it quarantined nothing, so the claimant's own URL can still serve the work while the log says it was taken down

**Where:** `src/app/api/admin/dmca/route.ts:82-107` (every failure inside `quarantineImages` is
`captureException` + `continue`), `:247-253` (the notice stamp's error is not checked at all),
`:253` (the response); `src/app/admin/dmca/page.tsx:147-149` (the toast).

**What happens:** `quarantineImages` walks the listing's images and, for each, swallows three
possible failures: `imagePath()` returning `null` (the stored `image_url` is not a
`/listing-images/` URL), the download failing, the upload to `dmca-quarantine` failing, or the
`remove` from `listing-images` failing. Each one is a Sentry event and a `continue`; the path is
simply left out of `moved`. The route then unconditionally stamps the notice `material_removed`
with `quarantined_paths = moved` — an update whose `error` is never inspected — and returns
`{ ok: true, images_quarantined: moved.length }`. `act()` in the page reads only `body.overdue`,
so the admin sees the same green "Done." whether seven images moved or zero did.

The failure this leaves is the exact one 00068 was written to close: `listing-images` is a public
bucket, object GETs there bypass policy evaluation entirely, and the URL the claimant put in their
notice is the URL on the listing page. If the removal step failed, they re-check it and the work
is still served — while the DMCA log, the admin's screen and the notice status all say the
material was removed.

**Why it's real:** I looked for a caller that checks the count and there is none: `act()` is the
only caller and it discards everything but `overdue`. I also looked for a verifier elsewhere —
db-smoke §13 asserts the row-level freeze and the FK, and never touches storage — so nothing in
the repo would notice. I could not make the storage calls fail from source alone, so the
*frequency* of this is UNVERIFIED; what is verified from source is that a failure is invisible and
still stamped as a completed removal. A single `SELECT image_url FROM listing_images` against a
listing whose URL is not a bucket URL would settle whether the deterministic sub-case exists in
production data.

**Fix direction:** Have `quarantineImages` return failures as well as successes, and make
`remove_material` refuse to stamp `material_removed` when any image could not be taken down —
report `{ ok: false, unremoved: [...] }` with a 500 so the admin knows to remove it by hand before
answering the claimant. The notice-row update needs its error checked like the listing update
above it does.

---

### P3 — A listing's images can be added, reordered and deleted with a stale acceptance: the gate is on the PATCH route, but the image writes never go through it

**Where:** `src/services/listings.ts:82-95` (`addListingImages`), `:97-108`
(`updateListingImage`), `:110-120` (`deleteListingImage`) — all direct supabase-js writes;
versus `src/app/api/listings/[id]/route.ts:33-34` (the gate on the save).

**What happens:** An artist whose Artist Agreement acceptance is stale is refused with a 403 and
`code: 'acceptance_required'` on every field change to a listing. On the same edit page, the image
uploader writes straight to `listing_images` through supabase-js, and RLS/00056's guards are the
only thing consulted — there is no acceptance check anywhere in that path. So they can replace
every photograph on every listing they own, change which one is primary, and delete the rest, all
while the platform's position is that they have not accepted the agreement those listings are sold
under. On the edit page itself the result is a half-save: the images change and persist, then
"Save" 403s.

**Why it's real:** I checked whether the images route through the API — `api/storage/listing-image`
only mints a signed upload URL (`src/lib/signedUpload.ts:20-36`) and does not touch the row; the
row inserts are the three functions above. The counter-argument I could not sustain is that
"listing edit" means only the listing row: the gate's own docstring in `src/lib/acceptance.ts:127-133`
says the gated set is "purchase, listing create/edit, message send, review submit, commission
actions", and swapping a listing's photographs is a listing edit by any reading. It stays a P3
because the interstitial makes this state short-lived for anyone using the app normally, and
because the harm is a policy gap rather than a data exposure.

**Fix direction:** Route the three image mutations through a gated API route (the pattern is
already there in `POST /api/listings`), or accept the gap deliberately and say so in a comment at
`addListingImages` — the thing to avoid is the current state where the gate looks complete and
one door is open.

---

## Appendix: minor

- `POST /api/commissions` is gated, but the `commissions` INSERT policy still admits a raw
  PostgREST insert (sanitised to `pending` by 00056's guard — db-smoke §9 demonstrates exactly
  this). Same class as r3's open P2 on `messages`/`reviews`, one table wider; not re-reported as a
  finding for that reason.
- `propose-ship-by` and `accept-ship-by` are the only order routes left that do not check
  `is_pickup`. Harmless today — both order cards hide the controls behind `!order.is_pickup` and
  the cron excludes pickup — but they will happily record a shipping promise on an order that has
  no shipping, and the buyer has no surface on which to accept it.
- `src/services/conversations.ts:63-82` creates a conversation client-side with no acceptance
  gate. An empty thread is not a message and the send is gated, so this is a nit — but it does put
  a new row in the other person's inbox.
- db-smoke §16's exemption list is annotated "each with its own internal auth check".
  `refresh_completeness_score(uuid)` has none — any authenticated caller may run it for any artist
  id. It only recomputes the score from that artist's own row, so there is nothing to gain; the
  comment is what is wrong.
- `handle_new_user` stamps the Terms of Service for every new `auth.users` row on the premise that
  the registration checkbox is the only way one appears. That is true today (I checked: no
  `signInWithOAuth`, no `signInWithOtp`, and `admin/users/route.ts` is a GET-only directory), but
  it is an unwritten invariant — the day an invite or SSO path is added, it will record an
  acceptance nobody made.

## Not findings

- **Acceptance cannot be forged from any direction I could find.** Every writer of
  `profiles.terms_*` is server-side: `handle_new_user` (00063, stamping `current_terms_version()`,
  with 00023's role sanitiser and 00018's `accepted_terms_at` both intact — I diffed it against
  both), the acceptance POST (service role, versions from `src/lib/agreement.ts`), and
  `recordTermsOfSaleAcceptance` (service role, idempotent, never overwrites an earlier date).
  `artist_profiles.agreement_*` is nulled on a non-privileged INSERT (00067, and I diffed it
  against 00032 — the only additions are the two new lines) and frozen on UPDATE (00056's body
  still carries 00037's two lines; I checked, since that is where a rebuild would drop them). The
  client has no grant on any of the four `profiles` columns, and `guard_profiles_update` is a
  faithful extension of 00052's body. db-smoke §10 and §15 assert the backdating attempt from both
  sides.
- **The `documents` array can only narrow.** It is filtered to the three known names, then
  intersected with the server's own outstanding set; no version is ever read from the request.
- **The gate is before the work in all 13 routes**, immediately after the 401 and before any body
  parse, read or write. Nothing is gated that should not be. `DELETE /api/listings/[id]` is
  deliberately ungated and I think that is right — removing your own content should not require
  accepting new terms.
- **IDOR on the seven new routes.** `return-shipped` (buyer, then a CAS on authorised-and-unshipped),
  `propose-ship-by` (artist, CAS on `status='paid' AND shipped_at IS NULL`), `accept-ship-by`
  (buyer, same CAS), `concede-dispute` (artist, CAS on `dispute_conceded_at IS NULL`),
  `cancel-unshipped` (buyer or artist, then the pickup refusal and the window test, CAS inside
  `cancelUnshippedOrder`); all five read the order through the user-context client first, so
  someone else's id 404s at RLS before the ownership test is even reached. Both admin routes check
  `profiles.role === 'admin'` before touching anything. The same holds for the seven commission
  actions: each resolves the artist's `profile_id` or `requester_id`, 403s, and CASes on the exact
  status it read.
- **`order_returns` RLS does what it claims.** The policy admits privileged contexts, the buyer,
  and the order's artist and nobody else; `REVOKE ALL` from both browser roles plus `GRANT SELECT`
  to `authenticated` leaves no client write and no anon read. An embedded join cannot widen it —
  PostgREST evaluates RLS on the embedded relation — and I grepped every reference to the table:
  there is no view and no `SECURITY DEFINER` function over it, and the only client reader
  (`useOrderReturns`) is an ordinary `.in('order_id', ...)` under RLS. db-smoke §14 proves it
  properly, including the outsider case and the `SET ROLE` without which the whole section would
  pass vacuously.
- **A non-admin cannot read the notice file, and the anon hole is closed.** 00068's
  `REVOKE ALL ON FUNCTION dmca_substantiated_count(UUID) FROM PUBLIC` is the right form, and §16
  now pins the whole class of `SECURITY DEFINER` functions rather than that one.
- **The `dmca-quarantine` bucket is genuinely private.** `public = false`, and I read every
  `storage.objects` policy in the migration history: every one of them is scoped to a named bucket with an explicit `bucket_id = '…'`, so none
  matches the new one, and with RLS on and no policy `anon`/`authenticated` can do nothing
  there.
- **The DMCA removal sticks at the row level, including against the service-role relist paths.**
  Status change and clearing the stamp are refused (00067), delete is refused, `pre_dmca_status` is
  frozen, and the listing PATCH route updates through the *user's* session so the guard applies.
  I specifically checked the two privileged writers that set `status: 'available'` — the refund
  webhook (`webhooks/stripe/route.ts:582`) and `settleRefund.ts:247` — and both compare-and-swap on
  `.eq('status', 'sold')`, so a DMCA-hidden listing is never relisted behind the guard's back.
- **Account deletion works again and the fix is ordered correctly.** The notice detach runs after
  the open-order check and before `deleteUser`, fails closed on a read or write error, and
  preserves the listing title in `notes`. The cascade's `BEFORE DELETE` guard passes because GoTrue
  carries no `request.jwt.claims`, so `is_privileged()` is true — the FK was the blocker and it is
  now handled in the route.
- **`GET /api/account/acceptance` fails open by design and cannot be used to bypass the gate**: it
  only decides what to render, and the POST re-derives the outstanding set server-side from the
  same function the gate uses. `acceptanceGate` fails closed on a *throw* as its docstring says
  (the rejection propagates and the route 500s), but `outstandingAcceptances` discards the two
  query `error`s and returns `[]`, so a supabase-js error object still opens the gate — that is
  r3's open P2, unchanged, and not re-reported. Worth noting only that the r4 fix added a second
  unchecked read (`artist_profiles`) on the same pattern; it does not widen the hole for artists,
  who already went through it, but it is one more place for the same fix to land.
- **D8 is treated as a content filter everywhere, not as access control.** `showMature` is a
  localStorage preference threaded through `MatureProvider` → `useFeed` → `feed.ts:93`,
  `featured.ts:18`, `partnerPicks.ts:29`, `SeriesTabs.tsx:35` and `MatureGate`; nothing keys a
  permission, an RLS clause or a route decision on it, and every failure branch (storage
  unavailable, preference not yet read) hides rather than shows. The `ready` flag on the context is
  what stops a first paint leading with mature work. The defect above is that `is_mature` cannot be
  *set* on an existing listing — the filter itself is correct.
- **The local-pickup sweep is complete for the callers that matter.** `buyerTookPossession()` is
  used by `approve-refund`, `authorizeReturn` and the artist's refund modal; `cancel-unshipped`,
  `settleRefund`'s `requireUnshipped` and the cron all refuse or exclude `is_pickup` before they
  reach a `shipped_at` test; and both order cards put their whole `fulfillmentWindow` block behind
  `!order.is_pickup`, so `missed` — which is still `!shipped_at && past deadline`, and therefore
  always true for a pickup order — is never rendered. `disputeOutcome.ts:157` keys on `shipped_at`
  but falls through to `delivered_at`, which a confirmed pickup does have.
