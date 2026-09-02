# Accounts, auth & access control — review 2026-09-02

**Files read:**

- Plumbing: `src/middleware.ts`, `src/lib/supabase.ts`, `src/lib/supabase-server.ts`, `src/lib/supabase-admin.ts`, `src/lib/sessionRetry.ts`, `src/lib/signedUpload.ts`, `src/lib/stripe.ts`, `src/lib/publicProfile.ts`, `src/utils/safePath.ts`, `src/context/AuthContext.tsx`, `next.config.mjs`, `.env.local.example`, `package.json`.
- Auth pages: `src/app/auth/callback/route.ts`, `src/app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`, `src/components/auth/CaptchaField.tsx`. The two onboarding pages were read only around their insert calls.
- All 52 `src/app/api/**/route.ts` files, in full.
- Callers consulted to confirm or kill findings: `src/services/messages.ts`, `src/services/follows.ts`, `src/services/orders.ts` (partial), `src/components/chat/MessageInput.tsx`, `src/components/chat/MessageBubble.tsx` (partial), `src/components/gallery/GalleryHero.tsx`, `src/app/(public)/gallery/[slug]/page.tsx`, `src/app/(user)/account/page.tsx` (delete + sign-out section), `src/components/layout/Navbar.tsx` (sign-out lines), `src/app/error.tsx`, `src/schemas/{message,review,commission,listing}Schema.ts`, `src/services/email.ts` (admin reset template), `scripts/db-smoke.sql` (grant-matrix section).
- Library internals, because two findings depend on them: `node_modules/@supabase/ssr/dist/main/createBrowserClient.js` (flowType default), `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js` lines 1625-1700 (`_getSessionFromURL`), `next` image loader behaviour (recalled, noted where it mattered).
- Migrations read in full: 00001, 00002, 00007, 00008, 00009, 00010, 00011, 00012, 00013, 00014, 00015, 00017, 00019, 00021, 00023, 00026, 00027, 00028, 00030, 00031, 00033, 00034, 00036, 00038, 00040, 00042, 00044, 00046. Every other migration was indexed with a grep for `CREATE/ALTER/DROP POLICY`, `GRANT`, `REVOKE`, `SECURITY DEFINER`, `ON DELETE`; none of the skipped files creates a policy or grant that the index did not show, so I did not open them line by line.

**Verdict:** The route layer is in good shape: every mutating route establishes identity with `getUser()`, every admin route checks `profiles.role` before touching the service-role client, and every `[id]` route that writes checks the caller is a party to the row, not merely that the row exists. The real problems are below the routes: a hard-delete cascade that destroys financial records, one auth flow whose link cannot mint a session under the PKCE browser client, and a handful of table grants and policies that let the public anon key do more than the UI ever asks.

**Verification 2026-09-02 (R0):** P1 admin reset link CONFIRMED on DEV: `generateLink({type:'recovery'})` → GoTrue `/verify` answers 303 to `/reset-password#access_token=…&type=recovery` (implicit hash), which the PKCE browser client refuses. P2 `website_url` `javascript:` href: with `target=_blank rel=noopener noreferrer` neither Chromium nor WebKit (Playwright) executes the payload in the opener or the popup (popup is `about:blank` opaque); Firefox not tested. Severity stays P2 (phishing/`data:` link under our domain); fix is the scheme CHECK in R8.

---

### P0 — Self-service account deletion cascades away orders, reviews and conversations

**Where:** `src/app/api/account/delete/route.ts:25`; `supabase/migrations/00001_initial_schema.sql:379-380` (`orders.buyer_id` and `orders.artist_id` are `ON DELETE CASCADE`), `:406-407` (reviews), `:268-269` (conversations), `:340-341` (commissions); `src/app/api/webhooks/stripe/route.ts:394-399` and `:464-469`.

**What happens:** A buyer with a paid order deletes their account. `auth.admin.deleteUser` removes the auth row, `profiles` cascades, and every `orders` row where they are the buyer is deleted, along with the review they left and the conversation with the artist. Three weeks later the card issuer opens a chargeback. `charge.dispute.created` looks the order up by payment intent, finds nothing, `break`s, and returns 200: no protection assessment, no artist notification, no admin notification, and no `disputed` state anywhere. The same happens for `charge.dispute.closed`, so the ineligible-order payout reversal never runs. The admin refund route 404s. The listing is still `sold` with no order behind it. The mirror case is worse: an artist with paid-but-unshipped orders deletes their account, and every buyer who has paid them loses the order from their history, their message thread (the only place a refund request lives), and any notification that anything happened. The Stripe connected account, holding a 14-day delayed balance, is left orphaned.

**Why it's real:** The route has no check for open orders, no soft-delete, and no anonymisation; it deletes the auth user and lets Postgres cascade. I grepped every `ON DELETE` clause in migrations 00003 through 00048; nothing alters the `orders`, `reviews`, or `conversations` foreign keys set in 00001. The route's own comment lists what the cascade removes and stops at "listings → images"; orders were not considered. The webhook's `if (!order) break;` on both dispute events is read, not assumed.

**Fix direction:** Refuse self-delete while the account is party to any order in `paid`, `shipped`, `disputed`, or with `refund_approved_at` set, and tell the user to contact support. Separately, change `orders.buyer_id` / `orders.artist_id` (and `reviews.reviewer_id`) to `ON DELETE SET NULL` or move to an anonymise-in-place flow, so that money rows outlive the people in them.

---

### P1 — Admin-triggered password reset link cannot produce a session in this app's browser client

**Where:** `src/app/api/admin/users/[id]/reset-password/route.ts:32-36`; `src/lib/supabase.ts:10` with `@supabase/ssr` `createBrowserClient.js:38` (`flowType: "pkce"`); `@supabase/auth-js` `GoTrueClient.js:1648-1650`; `src/app/(auth)/reset-password/page.tsx:33`.

**What happens:** An admin clicks Reset for a user who is stuck. The route calls `generateLink({ type: 'recovery' })` and emails `action_link`, which is the GoTrue `/auth/v1/verify?token=…&type=recovery&redirect_to=…/reset-password` URL. A server-generated recovery token carries no PKCE code challenge, so GoTrue verifies it and redirects to `/reset-password#access_token=…&refresh_token=…&type=recovery`, the implicit-grant shape. The browser client is `createBrowserClient` from `@supabase/ssr`, which sets `flowType: 'pkce'`. On load, auth-js sees an implicit callback while configured for PKCE and throws `AuthPKCEGrantCodeExchangeError('Not a valid PKCE flow url.')` (`GoTrueClient.js:1648-1650`), so no session is stored. The user types a new password, `updateUser` runs with no session, and they see "Auth session missing!". The one flow built to rescue users who cannot use `/forgot-password` does not rescue them.

**Why it's real:** The mismatch is in the library code shipped in `node_modules` at the pinned versions (`auth-js 2.99.1`, `ssr 0.9.0`), and nothing in `reset-password/page.tsx` or `AuthContext.tsx` reads the hash or calls `exchangeCodeForSession`. The public `/forgot-password` flow is unaffected because `resetPasswordForEmail` from the PKCE client sends a code challenge and the redirect comes back as `?code=`. **UNVERIFIED by execution:** I did not click a real link. What settles it: trigger one admin reset on staging and look at the URL fragment on `/reset-password`. If it contains `access_token`, the finding stands. The route landed in commit `68f9838` alongside the legal documents; I found no test covering it.

**Fix direction:** Use `link.properties.hashed_token` instead of `action_link` and email a link to an app route (the `/auth/callback` pattern) that calls `supabase.auth.verifyOtp({ type: 'recovery', token_hash })` with the cookie server client and then redirects to `/reset-password`. That mints the session server-side and works in any browser.

---

### P2 — `profiles.email` is writable by its owner; one PATCH blocks anyone else from registering with that address

**Where:** `supabase/migrations/00001_initial_schema.sql:15` (`email TEXT NOT NULL UNIQUE`) and `:28` (UPDATE policy, `USING` only); `00009_rls_column_guards.sql:21-29` (guard freezes `role` only); `00031_profiles_column_privacy.sql:13-15` (revokes SELECT, leaves UPDATE); `00023_signup_role_sanitize.sql:14-15` (`handle_new_user` inserts `NEW.email`); `scripts/db-smoke.sql:214-280` (pins SELECT grants only).

**What happens:** Any signed-in user sends `PATCH /rest/v1/profiles?id=eq.<own id>` with `{"email":"target@example.com"}` using the anon key and their session. RLS passes (own row), the guard trigger only inspects `role`, the table-level UPDATE grant is untouched, and the write succeeds. From then on, when the real owner of `target@example.com` tries to register, `handle_new_user` hits `profiles_email_key`, the trigger raises, the `auth.users` insert rolls back, and Supabase returns "Database error saving new user". The victim cannot create an account, the attacker's row is the only evidence, and nothing surfaces to an admin. Second effect: every server-side email keyed on `profiles.email` (new-message fan-out in `/api/messages`, order confirmation, drips, commission emails, the admin reset above) now goes to the chosen address, which makes the platform a trusted-sender mail cannon aimed at a third party.

**Why it's real:** Postgres applies the `USING` clause to the new row when `WITH CHECK` is omitted, so `id` cannot change, but `email` is unconstrained. Supabase's default privileges grant UPDATE on every column to `authenticated`; 00031 revoked SELECT only, and the smoke test asserts only SELECT grants, so this never showed up. The UI never writes `email`, which is exactly why the direct PostgREST path is the one that matters.

**Fix direction:** Extend `guard_profiles_update` to freeze `email` (and `unsubscribe_token`) for non-privileged callers, or revoke table UPDATE and grant back only `full_name, avatar_url, email_preferences`. Add the UPDATE grant matrix to `db-smoke.sql` so the next column added to `profiles` fails closed the way SELECT already does.

---

### P2 — The public anon key can read the entire follow graph and the entire user directory

**Where:** `supabase/migrations/00002_missing_tables_and_policies.sql:187-188` (`follows` SELECT `USING (true)`, own-row policy dropped); `00031_profiles_column_privacy.sql:14` (`profiles` SELECT granted to `anon` on `id, role, full_name, avatar_url, created_at, updated_at, email_preferences` under a `USING (true)` policy).

**What happens:** `GET /rest/v1/follows?select=follower_id,artist_id` with only the anon key returns every follow row on the platform. `GET /rest/v1/profiles?select=id,full_name,role,created_at,email_preferences` returns every registered person by name, role, signup date, and which marketing emails they have opted out of. Joined, that is a named list of every artist's followers and every buyer's follow list, with no account required. The UI only ever shows a follower *count* (`services/follows.ts` `getFollowerCount`) and a user's *own* follow list.

**Why it's real:** The 00002 comment says the intent was "follower count should be publicly visible", and the policy was written as row visibility to get the count. 00031 deliberately kept `profiles` public for identity display but also granted `email_preferences` to `anon`, which no anonymous surface reads. I looked for an anon reader of another user's follows and found none; the artist page count is the only public consumer.

**Fix direction:** Replace the `follows` `USING (true)` policy with the original own-row policy plus a `SECURITY DEFINER follower_count(artist_id)` function (or a view) for the public number. Drop `email_preferences` from the `anon` grant on `profiles` (the account page reads it as `authenticated`). Whether `full_name` for every buyer should stay anon-readable is a product call; note it in DECISIONS.md either way.

---

### P2 — `analytics_events` accepts unlimited anonymous inserts that never pass through the rate limiter

**Where:** `supabase/migrations/00009_rls_column_guards.sql:133-134` (`INSERT WITH CHECK (viewer_id IS NULL OR viewer_id = auth.uid())`); `src/middleware.ts:101,131` (matcher is `/api/:path*` only); `src/services/analytics.ts:10` (client-side insert exists today); `src/app/api/analytics/route.ts:26-38` (30-day view counts summed from this table).

**What happens:** A script holding the public anon key POSTs `{"artist_id":"<X>","event_type":"profile_view"}` to `/rest/v1/analytics_events` in a loop. Every insert succeeds (viewer_id null is allowed), the table grows without bound, and artist X's Studio analytics show whatever number the script chose. The middleware never sees a byte of it because the requests go to `*.supabase.co`, not to `/api/analytics`. The same shape applies to `reports` (authenticated, `WITH CHECK (auth.uid() = reporter_id)` and nothing else) and to `messages`, where the 120/min chat limit on `/api/messages` is bypassable by inserting directly under the participant policy. The middleware's `/api/reports` entry refers to a route that does not exist.

**Why it's real:** The policy and the matcher are both read. This is the general answer to "which mutating paths get no rate limiting": everything the browser writes with supabase-js. Of the five flows you named, signup, login and password reset also never touch `/api`; they are governed by Supabase Auth's own limits plus Turnstile, and whether Turnstile is *enforced* is a dashboard setting I cannot see (the client-side `captchaEnabled` flag proves only that the widget renders). Message send and review submit do go through `/api` and are covered (120/min, 60/min, and 5/min per IP).

**Fix direction:** Drop the anon INSERT policy on `analytics_events` and make `/api/analytics` POST (already throttled) insert with the service role, or wrap the insert in a `SECURITY DEFINER` function that debounces per viewer or IP. Decide per table whether `reports` and `messages` should keep their direct-insert policies now that routes exist for both.

---

### P2 — Partner `website_url` is rendered as a raw `href` with no scheme check (UNVERIFIED exploitability)

**Where:** `src/components/gallery/GalleryHero.tsx:35-43` (`<a href={gallery.website_url} target="_blank" rel="noopener noreferrer">`); `src/app/(public)/gallery/[slug]/page.tsx:33-40` (public page for any `gallery_profiles` row, verified or not); write paths: `src/app/(auth)/onboarding/gallery/page.tsx:58` and `src/components/profile/GalleryProfileEdit.tsx:68,82` (client-side, own-row RLS, no server validation) and the direct PostgREST path.

**What happens:** Partner accounts are self-service and their public page is reachable by slug before verification. A partner sets `website_url` to `javascript:…` (the client zod `.url()` accepts any scheme, and a direct PATCH skips zod entirely). Every visitor to `/gallery/<slug>` gets an anchor whose href is attacker script. React 18 warns about `javascript:` hrefs but renders them. The Supabase session lives in cookies written by the browser client, which are not HttpOnly, so script running on this origin can read them. **What I could not confirm without a browser:** the anchor has `target="_blank" rel="noopener noreferrer"`. Current Chromium and Firefox give a noopener new window an opaque origin, which should neutralise a `javascript:` payload; Safari's behaviour I am not certain of. If any supported browser executes it, this is a P0 (visitor session theft, including an admin previewing a pending partner). If none does, the residual is a clickable `data:` or phishing link under our domain, which is P2.

**Why it's real:** The sink, the public reachability, and the absence of any scheme validation on any write path are all read. What settles it: on staging, set a test partner's `website_url` to `javascript:alert(document.cookie)` and click it in Chrome, Firefox and Safari.

**Fix direction:** Validate `website_url` server-side to `https?:` (a CHECK constraint on `gallery_profiles` and `artist_profiles`, since the DB is the only chokepoint the direct API path passes through), and have `GalleryHero` refuse to render an anchor for anything else. A CSP header in `next.config.mjs` would make this class of bug non-fatal regardless.

---

### P3 — `is_privileged()` treats "no user" as "trusted", so every column guard is one anon-write policy away from being bypassed

**Where:** `supabase/migrations/00009_rls_column_guards.sql:12-18`; `00008_partner_hardening.sql:17-19` (same pattern in `guard_gallery_profile_update`).

**What happens:** `is_privileged()` returns true when `auth.uid() IS NULL`. That is meant to identify the service role, but it is equally true for a request made with the bare anon key and no session. Today no table has an UPDATE policy an anonymous caller can satisfy, so the guards are never reached in that state. The next migration that adds an anon-writable path (an anonymous INSERT that a `BEFORE INSERT` guard is supposed to sanitise, like `guard_artist_profiles_insert`) will find the guard silently disabled for exactly the least-trusted caller.

**Why it's real:** I confirmed that `analytics_events` is the only anon-insertable table and that it has no guard, so this is not exploitable now. It is a maintainability trap in the file the whole permission model rests on, which is what P3 is for.

**Fix direction:** Distinguish the service role explicitly (`current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'`, or `auth.role() = 'service_role'`) instead of inferring it from a missing `uid`. Add a smoke-test assertion that `is_privileged()` is false under the `anon` role.

---

## Appendix: minor

- `src/app/api/messages/route.ts:39-46` and `src/app/api/commissions/[id]/updates/route.ts:11,36`: attachment `url` / `photoUrl` accepted verbatim. In production, next/image passes an unconfigured host to `/_next/image`, which returns 400, so the result is a broken image rather than a crash (the hostname throw is dev-only). Still, validate the shape (storage path or same-origin URL).
- `src/app/api/orders/[id]/notify-shipped/route.ts`: no once-only stamp; the artist can re-send "your order shipped" to the buyer as often as the default 60/min bucket allows.
- `src/app/api/admin/verifications/[id]/route.ts:12,22-24`: any `action` other than `approve` rejects; no compare-and-swap on `status`, so an approve after a reject re-flips the badge; the artist's notification links to `/dashboard`, which is the partner home, not `/studio`.
- `src/app/api/listings/[id]/route.ts:122-123`: deleting a listing that has an order fails on the `orders.listing_id` FK and returns the raw Postgres message as a 500. Correct outcome, wrong surface.
- `src/app/api/admin/services/route.ts:22-28` and `[id]/route.ts:18-24`: `requireAdmin()` returns 403 for anonymous callers where the other admin routes return 401. Cosmetic.
- `src/components/layout/Navbar.tsx:80,154`: `signOut()` is fire-and-forget. auth-js keeps the local session when the logout call fails with anything other than 401/403/404, so a Supabase 5xx leaves the user signed in with no toast. The UI does still show them as signed in, so this is silent failure, not a fake sign-out.
- `supabase/migrations/00019_houston_verified.sql:21-22`: the `verification_requests` INSERT policy does not pin `status`, so an artist can insert a row already marked `approved`. The badge itself is guard-frozen, so the effect is a confusing admin queue only.
- `supabase/migrations/00002_missing_tables_and_policies.sql:151-152`: `reports` INSERT lets the reporter set `status`, `admin_notes`, `resolved_by`. Nuisance only.
- `src/app/api/conversations/route.ts:44-55` with `00038:120-122`: any authenticated user can open a thread with any `profiles.id`, and profile ids are anon-enumerable (see the follows finding). The UI only offers messaging artists; buyer-to-buyer cold DMs are possible by hand.
- `src/middleware.ts:11`: `/api/reports` has a limit entry but no route; reports are inserted client-side.
- `src/app/(auth)/reset-password/page.tsx`: no guard for "arrived without a recovery session"; the user only learns on submit.

## Not findings

- **Admin client enumeration.** Every one of the 60-odd `createAdminSupabaseClient()` call sites is preceded by the check it needs: the nine `admin/*` routes and `galleries` PATCH check `getUser()` then `profiles.role === 'admin'`; `account/delete` uses it only on `user.id`; `artist/application`, `artist/submit`, `payments/stripe-connect` scope every admin read and write to `profile_id = user.id`; the six `commissions/[id]/*` routes read the commission under the user's RLS, check the caller is the artist or requester explicitly, then write with a compare-and-swap on id + status; `orders/approve-refund`, `confirm-pickup`, `notify-shipped` check the caller is the order's artist or buyer before any admin write; `listings` POST/PATCH use it only to stamp publish/price-drop claims on a row already ownership-checked; `commissions` POST, `messages` POST, `reviews` POST use it only to read a counterparty email after an RLS-guarded insert; `payments/checkout` reads the artist row by the listing the user could already see; `unsubscribe` is token-keyed by design; `webhooks/stripe` is signature-gated; the four cron routes compare `CRON_SECRET`. `listingAlerts.ts` is server-only and called from ownership-checked routes.
- **IDOR across `[id]` routes.** Every writing `[id]` route checks party membership, not existence: commissions (artist via `artist_profiles.profile_id`, requester via `requester_id`), orders (artist or buyer), listings (owner via embed), artists/[slug] and pinned (owner), conversations/[id] GET (explicit participant check). Admin `[id]` routes are role-gated, which is the intended model.
- **RLS-only routes.** `conversations/[id]/messages` GET/POST and `conversations/[id]/read` have no app-level participant check. A non-participant gets an empty list, a 42501 on insert, or a zero-row update. That is RLS doing its job, not a gap.
- **Reassigning ownership through UPDATE.** `listings`, `artist_profiles`, `gallery_profiles` and `profiles` UPDATE policies omit `WITH CHECK`, so Postgres applies `USING` to the new row too; an artist cannot move a listing to another artist's id, and a user cannot change `profiles.id`. Only `email` slips through (finding above).
- **Storage routes.** Path is `${user.id}/${Date.now()}-${random}` chosen server-side; INSERT policies are folder-scoped to `auth.uid()` for all six buckets after 00038; size and MIME caps live on the buckets (00012) and Supabase enforces them on signed uploads. MIME is the declared Content-Type, but a mislabelled HTML body is served as `image/png` from the storage origin, so it is not an XSS vector here. `chat-attachments` is private and rendered via `createSignedUrl`, whose SELECT policy is participant-scoped.
- **Auth callback and login `returnUrl`.** `isSafeInternalPath` rejects `//`, backslashes, and any whitespace or control character, which covers the tab-smuggling variant. Both consumers use it.
- **Email enumeration.** Signup returns the Supabase stub user with no session for existing addresses and the register page renders the same screen; `resend` and `resetPasswordForEmail` are silent on unknown addresses; login returns one generic error. No differential.
- **Sign-out completeness.** `supabase.auth.signOut()` defaults to `scope: 'global'`, revoking every refresh token server-side and clearing the cookie session; `onAuthStateChange` then nulls the user. The account-delete flow signs out after the server confirms deletion. React Query keys include the user or artist id, so a second user on the same browser does not see cached rows.
- **Signup role.** `handle_new_user` (00023) coerces anything other than `artist`/`gallery` to `user`; `guard_profiles_update` blocks later role changes; the admin approval gate (00030) and `guard_artist_profiles_insert` mean a self-created artist row is dark until an admin flips it.
- **Stripe webhook.** Signature is verified against both endpoint secrets with the SDK's default 5-minute tolerance. There is no event-id ledger, but every handler is idempotent by state: `checkout.session.completed` checks for an existing order by payment intent and relies on the one-live-order index; `charge.refunded` and both dispute events check status or `stripe_reversal_id` before acting; `account.updated` is a plain overwrite. A Connect-signed `checkout.session.completed` would be processed as the platform's, but Express accounts cannot create sessions, so the path is unreachable.
- **NEXT_PUBLIC surface.** Only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL`, `PAYMENTS_ENABLED`, `SENTRY_DSN`, `TURNSTILE_SITE_KEY` are referenced in `src/`; all are public by nature. `SUPABASE_SERVICE_ROLE_KEY` appears only in `supabase-admin.ts`, which is imported only by route handlers and `lib/listingAlerts.ts`.
- **Column privacy.** `profiles.email`/`unsubscribe_token` and `artist_profiles.rejection_reason`/`reviewed_*`/`stripe_account_id` are revoked from client roles and the smoke test pins that; every client-context select in the routes uses the explicit column lists.
- **`x-forwarded-for` trust in the rate limiter.** Vercel overwrites the header with the connecting IP, so taking the first entry is correct on this host.
- **Tables whose policies allow a read the UI does not offer** (for the record, beyond the two findings): `reviews` exposes `order_id` and `reviewer_id` to anon (UUIDs, harmless alone); `gallery_profiles` exposes unverified partners and their `address` to anon (the public page does the same); `artist_services` exposes provider contact details to every signed-in user (by design per 00034). `drip_emails_sent`, `notifications`, `saved_listings`, `blocked_users`, `muted_conversations` are correctly private.
