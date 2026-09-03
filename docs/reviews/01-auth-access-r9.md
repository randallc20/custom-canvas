# Accounts, auth & access control — review 2026-09-03 (r9)

**Files read:**

- `git log -p -3` in full (`f875d61`, `474e094`, `1ebb6b9`).
- `src/lib/acceptance.ts`, `src/lib/acceptance.test.ts` (and ran it: 16 passed).
- All thirteen `acceptanceGateFor` call sites, individually, at HEAD:
  `src/app/api/commissions/route.ts`, `.../commissions/[id]/accept|complete|confirm|decline|dispute|updates|withdraw-dispute/route.ts`,
  `src/app/api/listings/route.ts`, `src/app/api/listings/[id]/route.ts`,
  `src/app/api/messages/route.ts`, `src/app/api/payments/checkout/route.ts`,
  `src/app/api/reviews/route.ts`.
- Every client of those routes: `src/services/messages.ts`, `src/hooks/useMessages.ts`,
  `src/services/listings.ts`, `src/hooks/useReviews.ts`,
  `src/components/commission/CommissionPanel.tsx`, `.../CommissionForm.tsx`,
  `.../CommissionUpdates.tsx`, `src/components/chat/MessageBubble.tsx`,
  `src/app/checkout/[listingId]/page.tsx` (error path).
- `src/app/api/account/acceptance/route.ts` (GET and POST), `src/services/acceptance.ts`,
  `src/components/legal/AcceptanceInterstitial.tsx`.
- `src/app/api/admin/dmca/route.ts` and `src/app/admin/dmca/page.tsx`, both in full.
- `src/middleware.ts`, `src/lib/supabase-admin.ts`, `src/lib/sessionRetry.ts`.
- `src/app/api/orders/[id]/cancel-unshipped/route.ts` and `src/components/studio/SalesSection.tsx`
  (the other access-shaped half of `f875d61`), `src/app/api/artist/submit/route.ts`.
- Migrations `00058`, `00063`, `00065`, `00067`, `00068`, `00069`, plus `00001`/`00018`/`00023`
  (`handle_new_user` lineage), `00009`/`00052` (`guard_profiles_update` lineage, `is_privileged`),
  `00002`/`00012`/`00038`/`00056` (storage policies).
- `scripts/db-smoke.sql` §7 and §10–§14, plus the §12 heading of §15/§16.
- `docs/CONVENTIONS.md`, `docs/POST-LAUNCH-BACKLOG.md`.
- `docs/reviews/01-auth-access-r3.md` … `-r8.md` and `04-money-r5.md` … `-r10.md` **by finding
  heading**, plus the full text of `01-auth-access-r5.md` §P2 (quarantine record) where I needed to
  know whether a finding of mine had already been made.

**Skipped, and why:** `README.md` and `DECISIONS.md` were not opened — the prompt's "already
settled" list and `CONVENTIONS.md` covered the ground I needed, and nothing in this pass turned on
a product decision I was unsure of. `01-auth-access.md` and `-r2.md` were not read (the prompt
named r3–r8). I did not run the app, `db-smoke`, or the e2e suite.

**Verdict:** The gate rewrite is clean. All thirteen call sites were rewritten identically and
correctly, the gate still fails closed on both branches, the new `acceptance_unavailable` code
falls through nowhere it matters, the test that pins it has teeth, and the signup role sanitiser is
present at HEAD with a smoke assertion that would actually catch its removal. **No P0 and no P1.**
What is left is two P2s (one a genuine state-machine hole in DMCA `restore`, one a client that
throws away the server's refusal sentence) and two P3s, none of which is launch-blocking.

---

## Answers to the questions asked

**All thirteen call sites.** Every one is now, verbatim:

```ts
const gate = await acceptanceGateFor(user.id);
if (gate) return NextResponse.json(gate.body, { status: gate.status });
```

| # | Route | 403 body | 503 body |
|---|---|---|---|
| 1 | `commissions/route.ts:36` | `{error, code:'acceptance_required', outstanding:[…]}` @403 | `{error, code:'acceptance_unavailable', outstanding:[]}` @503 |
| 2 | `commissions/[id]/accept/route.ts:16` | same | same |
| 3 | `commissions/[id]/complete/route.ts:15` | same | same |
| 4 | `commissions/[id]/confirm/route.ts:15` | same | same |
| 5 | `commissions/[id]/decline/route.ts:15` | same | same |
| 6 | `commissions/[id]/dispute/route.ts:15` | same | same |
| 7 | `commissions/[id]/updates/route.ts:17` | same | same |
| 8 | `commissions/[id]/withdraw-dispute/route.ts:18` | same | same |
| 9 | `listings/route.ts:20` | same | same |
| 10 | `listings/[id]/route.ts:34` (PATCH only) | same | same |
| 11 | `messages/route.ts:47` | same | same |
| 12 | `payments/checkout/route.ts:41` | same | same |
| 13 | `reviews/route.ts:36` | same | same |

`grep -rn "json(gate" src/` returns exactly those thirteen lines and nothing else. **None kept the
old shape, none serialises `gate` instead of `gate.body`, none hardcodes a status.** The sed did
not miss one. I also enumerated every write route under `src/app/api` and confirmed thirteen is the
whole set of gated routes — no sibling that used to be gated has silently lost its gate. The
2-argument `acceptanceGate` (the pure decision, whose return type also changed) has exactly one
caller, inside `acceptance.ts` itself, so no stale consumer of the old `{error, code, outstanding}`
shape survives anywhere.

Note the 403 body is byte-identical to what the old code returned, so nothing on the wire changed
for the `acceptance_required` case — `e2e/acceptance.spec.ts:96,169` still asserts against the
right thing.

**Is 503 the right refusal, and does the gate still fail closed?** Yes on both counts. The catch in
`acceptanceGateFor` (`src/lib/acceptance.ts:205-218`) returns a refusal object, and every call site
returns on any truthy gate — so a lookup failure still refuses the write. In all thirteen the gate
is the first thing after the 401 check, before any request body is parsed and before any Stripe
call, so a 503 leaves no partial state anywhere (checkout in particular creates nothing).

On the opposite question: a caller cannot drive the lookup into failure deliberately and cannot use
the result for anything. The `userId` is `user.id` from the cookie session, never from the request;
`outstandingAcceptances` throws only when `profiles` or `artist_profiles` returns a PostgREST
`error`, which a caller cannot induce for someone else's row; and the 503 body is a fixed sentence
with `outstanding: []` — it discloses nothing about the account. It is purely a denial. The one
thing 503 buys an attacker is a distinguishable response, and it is the same response for every
user, so there is no oracle in it.

**Does any client branch on `code` in a way that now falls through wrongly?** No. Exactly one client
in the repo reads `code`: `src/services/messages.ts:81`, and it calls
`announceAcceptanceRequired()` only for `acceptance_required`, which is correct — there is nothing
to accept on a 503. Every other client (`listingApi`, `reviewApi`, `CommissionPanel.performAction`,
`CommissionForm`, `CommissionUpdates`, checkout) forwards `body.error` as the toast and never looks
at `code` or the status, so the new code is invisible to them and the 503's own sentence reaches
the user unaltered.

**Did the second code make checkout worse?** No — marginally better. `src/app/checkout/[listingId]/page.tsx:97`
throws `new Error(err.error)`, so the 503's sentence ("We could not check your account just now, so
this did not go through. Please try again in a moment.") is displayed verbatim and is fully
actionable on its own. Backlog #17's complaint is that the *403*'s sentence points at a banner that
may not be on screen; the 503 message points at nothing and needs no banner, so adding it does not
widen that gap. Backlog #17 stands exactly where it was.

**The test file.** The mock is honest. `maybeSingle` returns `{ data: null, error: { message:
'statement timeout' } }` — an `error` in the supabase-js result, not a thrown exception — and
`outstandingAcceptances:101` (`if (profileError) throw profileError`) is what converts it, so the
test exercises the real path rather than a synthetic throw. Both new tests have teeth against the
old implementation: the 503 case would have *rejected* rather than resolved (the old
`acceptanceGateFor` was a bare pass-through with no catch), and the 403 case reads `gate?.status`,
which did not exist on the old `{error, code, outstanding}` shape. I ran the file: 16 passed. One
caveat is in the appendix.

**Signup and role.** The pin has teeth at HEAD. `handle_new_user` at `00063:54-83` carries 00023's
sanitiser (`safe_role := CASE WHEN requested IN ('artist','gallery') THEN requested ELSE 'user'
END`), and `00063` is the newest of the four definitions in the tree (`00001`, `00018`, `00023`,
`00063`) — nothing since restates it, and nothing in `f875d61` touches SQL at all. db-smoke §12
(`scripts/db-smoke.sql:1375-1451`) inserts into `auth.users` with
`raw_user_meta_data = '{"role":"admin"}'` and raises `SIGNUP ROLE ESCALATION` unless the resulting
profile is `user`; it also asserts `artist` still lands as `artist`, so the assertion cannot be
satisfied by a sanitiser that is merely blunt. It clears `search_path` to `pg_catalog` first, which
is what makes it reproduce GoTrue rather than psql. I also checked the two other functions with a
restate history for the same disease: `guard_profiles_update` (`00009` → `00052` → `00058`) and
`guard_listings_update` (`00065` → `00067` → `00069`) each strictly *add* clauses and drop none.

---

## Findings

### P2 — DMCA `restore` on a notice whose material was never removed takes a live listing off sale, and reports success

**Where:** `src/app/api/admin/dmca/route.ts:335-431` (the `restore` branch), specifically `:390`
(`let target = listing?.pre_dmca_status ?? 'hidden'`) and `:410-418` (the write);
`src/app/admin/dmca/page.tsx:252-264` (the *Counter-notice received* button is offered at status
`received`, not just `material_removed`) and `:273-277` (*Restore* is the only control at
`counter_received`).

**What happens:** A claimant sends a notice; the admin logs it, and it sits at `received`. Before
the admin removes anything — the artist gets in first, or the notice looks weak — a counter-notice
arrives. The card at `received` offers *Counter-notice received*, so the admin presses it; the route
stamps `counter_received` and `counter_received_at`. The card now offers exactly one button:
*Restore*. Ten business days later the admin presses it to close the notice out.

`restore` never checks that anything was ever removed. It passes the `otherLive` check (there is no
other notice), reads the listing, and computes `target = listing?.pre_dmca_status ?? 'hidden'`.
Nothing was removed, so `pre_dmca_status` is `NULL`, so `target` is `'hidden'` — and the route
writes `status: 'hidden'` over a listing that was `available` the whole time. The response carries
no `listing_restored: false`, so `act()` (`page.tsx:149-152`) toasts the plain green "Done." The
artist is told nothing. Their piece is off the marketplace, and the only person who could notice is
the admin who just saw a success message.

**Why it's real:** I looked for the innocent explanations and none holds. It is not blocked at the
UI: `page.tsx:252` explicitly includes `'received'` in the statuses that offer *Counter-notice
received*, and `:273` offers *Restore* on any `counter_received` row with no condition on
`dmca_removed_at` or on the listing's state. It is not blocked at the route: the `restore` branch
reads `notice.status` nowhere, and the only precondition is the 10-business-day window, which
`counter_received_at` satisfies. It is not caught by the live-order check at `:394-401` — that only
ever moves `target` from `available` to `hidden`, i.e. in the same direction as the bug. And the
column guard does not save the listing either: `guard_listings_update` (`00069:43-59`) only refuses
a status change while `dmca_removed_at IS NOT NULL`, and here it is `NULL`, so the service-role
write lands unopposed.

This is adjacent to but distinct from the two DMCA items on the backlog. Backlog #12 is that
`withdraw`/`defective` are unreachable at `counter_received` — that dead end is what *forces* the
admin onto the Restore button, but the defect here is what Restore then does to the listing.
Backlog #13 is about the page's static "were restored" caption on `withdrawn`/`defective` rows, a
different status and a different code path. r5's P2 observed the `?? 'hidden'` fallback in passing,
as a downstream consequence of the quarantine-paths-on-the-notice bug that `00069` fixed; the
fallback itself was never the finding and is still here.

Why not P1: it needs a counter-notice on a notice whose material was never removed, which is not
the ordinary order of events, and the damage is one listing's status, reversible by the artist from
Studio at any time (`dmca_removed_at` is `NULL`, so nothing stops them). No money moves and no data
is exposed.

**Fix direction:** Make `restore` refuse, or no-op on the listing, when the notice it is called on
never removed anything — the honest test is `listings.dmca_removed_at IS NULL`, in which case there
is nothing to restore and the listing must not be touched at all, only the notice stamped. The
response should say `listing_restored: false` in that case so the toast stops claiming otherwise.

---

### P2 — The in-thread quote card discards the server's refusal sentence entirely and pages Sentry for an expected acceptance refusal

**Where:** `src/components/chat/MessageBubble.tsx:89-101` — `if (!res.ok) throw new Error();`, then
`captureException(err, { where: 'MessageBubble.quoteAction' })` and
`toast('Action failed. Try again.', 'error')`. The routes it calls are gated call sites #4 and #6,
`src/app/api/commissions/[id]/confirm/route.ts:15` and `.../decline/route.ts:15`.

**What happens:** A buyer who has not yet accepted Terms of Service v2.0 — which, under ruling D11,
is every pre-existing account until they clear the interstitial — opens a commission thread and
presses **Accept** on the artist's quote card. `POST /api/commissions/<id>/confirm` returns 403
`acceptance_required` with a sentence explaining exactly what to do. `act()` throws
`new Error()` with **no message at all**, so the sentence is destroyed before it reaches the catch;
the buyer sees "Action failed. Try again.", the interstitial is not reopened (nothing here dispatches
`ACCEPTANCE_REQUIRED_EVENT`), and pressing the button again produces the same nothing. A Sentry
event fires on every press, for a refusal that is the app working exactly as designed.

**Why it's real:** I checked whether something else rescues it. `sendMessage`
(`src/services/messages.ts:75-88`) is the only client that reopens the interstitial, and this
component does not go through it — it calls `fetch` directly at `:89`. The interstitial's own query
has `staleTime: 5 * 60_000` and only opens on `blocks`, so if the buyer dismissed it earlier in the
session (`sessionStorage` `cc_acceptance_dismissed`, `AcceptanceInterstitial.tsx:52`) nothing brings
it back on this path. And unlike every sibling client — `listingApi`, `reviewApi`,
`CommissionPanel.performAction:85`, the checkout page — this one does not even forward `body.error`,
so the buyer gets strictly less information here than anywhere else in the app. `useSendMessage`
(`src/hooks/useMessages.ts:73-75`) deliberately suppresses Sentry for policy refusals for exactly
this reason; this call site does the opposite.

This is the same *class* as backlog #17, which names `AcceptanceInterstitial.tsx` and
`checkout/[listingId]/page.tsx`. I am raising it because the call site is different and the
behaviour is worse in a way #17 does not describe: checkout at least shows the server's words, and
neither of #17's files fires a Sentry event per click. `f875d61` did not create this and did not
make it worse — the 503 lands here identically to the 403, and both were already swallowed.

**Fix direction:** Read the body and throw an error carrying `body.error`, the way
`CommissionPanel.performAction` two files over already does, and call
`announceAcceptanceRequired()` when `body.code === 'acceptance_required'`. Skip `captureException`
when the status is 403 or 503, matching the `MessageRefusedError` rule in `useSendMessage`.

---

### P3 — Nothing asserts that the `dmca-quarantine` bucket is private, which is the single fact the removal path rests on

**Where:** `supabase/migrations/00068_dmca_execute_and_quarantine.sql:30-38` (the bucket is created
with `public = false` and given no policies); `scripts/db-smoke.sql:931-1026` (§7, the storage
matrix).

**What happens:** `quarantineImages` (`src/app/api/admin/dmca/route.ts:72-109`) disables access by
copying each object from the public `listing-images` bucket into `dmca-quarantine` and deleting the
public copy — at the *same path*. So the object's name inside the quarantine bucket is exactly the
name it had in the public one, and the claimant's original URL differs from a hypothetical
quarantine URL only in the bucket segment. If `dmca-quarantine.public` is ever flipped to `true` —
a click in the Supabase dashboard, or a future migration that reuses `00068`'s
`ON CONFLICT (id) DO UPDATE SET public = …` line with the wrong value — every quarantined file is
served again over a public URL, the DMCA log still says the material was removed, and nothing in
the repo notices.

**Why it's real:** I checked what §7 actually pins. The exact-set policy matrix at `:940-970` would
catch a *policy* being added for the quarantine bucket (any new policy shows up as `UNEXPECTED`),
so the RLS half is genuinely covered. But a public bucket does not need a SELECT policy — that is
the whole point of the comment at §7's head, and of `00056`, which dropped the "Anyone can view"
policies precisely because public buckets serve object GETs without evaluating policy. The
behavioural loop at `:995-1025` iterates a hardcoded list of the five public buckets and does not
include `dmca-quarantine`, and no assertion anywhere in `db-smoke.sql` reads `storage.buckets`. So
the one bucket whose privacy the safe harbour depends on is the one bucket whose privacy nothing
checks. It is fail-closed today — I have no evidence the flag is wrong on any database — which is
why this is P3 and not higher.

**Fix direction:** Add one assertion to §7 that `SELECT public FROM storage.buckets WHERE id =
'dmca-quarantine'` is `false`, and that the same is true for `chat-attachments` while you are
there. It is three lines in the section that already exists.

---

### P3 — `f875d61` made every 503 from `/api/messages` a silent "policy refusal", so a platform outage on message send no longer reaches Sentry

**Where:** `src/services/messages.ts:78` (`if (res.status === 403 || res.status === 503)`),
`src/hooks/useMessages.ts:73-75` (`if (!(err instanceof MessageRefusedError)) captureException(...)`).

**What happens:** Before `f875d61` the condition was `res.status === 403` alone, so any 503 fell
through to `throw new Error(msg)` and `useSendMessage`'s `onError` reported it to Sentry. It is now
classified as a `MessageRefusedError`, and the class's own doc comment (`:37-40`) says that means
"expected behavior, ... never a Sentry event". For the case the fix was written for that is
correct and loses nothing, because `acceptanceGateFor` already captures the underlying exception
server-side (`src/lib/acceptance.ts:208`). But a 503 that does *not* come from the gate — an edge
or platform-level 503 in front of the function, where the body is HTML, `body.error` is undefined
and the toast falls back to "Failed to send message" — now produces no Sentry event from either
side, because the server code never ran.

**Why it's real:** `/api/messages` has exactly one 503 of its own (the gate, line 47) — I read the
route end to end and every other error path is 400, 401 or 403 — so the widened condition is
correctly scoped for everything the app itself emits, and the only losses are 503s the app did not
generate. UNVERIFIED as to frequency: I cannot tell from the repo whether Vercel actually answers
503 for this project rather than 500/504, and that is what would settle whether this ever fires.
The narrow fix is available regardless, which is why it is worth writing down rather than guessing.

**Fix direction:** Gate the 503 branch on the code rather than the status —
`res.status === 403 || body.code === 'acceptance_unavailable'` — so an unattributed 503 goes back to
being a plain `Error` and keeps its Sentry event. The user-facing toast is unchanged either way.

---

## Appendix: minor

- `src/lib/acceptance.test.ts:5-16`: the mocked admin client's `from()` ignores its table argument,
  so the `artist_profiles` lookup gets back the *profiles* row — the 403 fixture is therefore a
  `role: 'user'` account that also has an artist profile with `agreement_version: undefined`, and
  it owes `artist_agreement` as well as `terms`. The assertions (`toContain('terms')`, and
  `outstanding` empty on the 503) still hold and still have teeth; the fixture is just not a state
  a real database can be in.
- `src/app/api/admin/dmca/route.ts:372` and `:424`: two more `dmca_notices` status stamps whose
  error is discarded, same class as backlog #14 (which names only the `material_removed` stamp at
  `:305`). Worth folding into that entry rather than tracking separately.
- `src/app/api/listings/[id]/route.ts`: `PATCH` is acceptance-gated, `DELETE` at `:144` is not. An
  artist with a stale acceptance cannot edit a listing but can delete one. Probably deliberate;
  nothing states it either way.
- `src/app/api/admin/dmca/route.ts`: neither `remove_material` nor `restore` has a status
  precondition — the state machine is enforced only by which buttons `page.tsx` renders. Every
  action is admin-only, so this is a robustness note, not an access hole.
- `src/middleware.ts:10`: `/api/commissions` is 5 POSTs/minute, and the longest-prefix rule gives
  the same bucket to `/api/commissions/[id]/*`, so an artist posting several progress updates in a
  minute shares the create-a-commission budget. `limitFor` exempts GETs but not these POSTs.
- `src/components/studio/SalesSection.tsx:334`: the `!order.refund_approved_at` condition added by
  `f875d61` hides the whole ship-by block, so "Can't ship in time" disappears alongside "Cancel
  order". Correct for an order being unwound, but it was not called out in the commit message.

## Not findings

Things I read closely and concluded are fine:

- The thirteen-file sed. All thirteen verified individually at HEAD, plus a repo-wide `grep` for
  `json(gate` and an enumeration of every write route to confirm no gated route was dropped.
- `acceptanceGate` (2-arg): return type changed, but its only caller is `acceptanceGateFor`.
- Fail-closed on both branches, in all thirteen, with the gate ahead of any body parse or Stripe
  call — a 503 leaves no partial state.
- The 403 wire format is unchanged from before `f875d61`, so `e2e/acceptance.spec.ts` still asserts
  the right thing.
- `outstandingAcceptances` still throws on both `profileError` and `artistError`; the read endpoint
  (`account/acceptance/route.ts:33-41`) still fails open and the POST (`:87-97`) still fails closed
  with a 503, which is r6's P3 staying fixed.
- The acceptance POST's `documents` array can only narrow (`:59` filters against what is genuinely
  outstanding) and takes no version from the client; both stamps assert affected rows per
  CONVENTIONS rule 1.
- `handle_new_user` at HEAD is `00063`'s body with 00023's sanitiser intact; db-smoke §12 pins it
  with a real escalation attempt under a cleared `search_path`.
- `guard_profiles_update` and `guard_listings_update` restate histories: both strictly additive, no
  clause dropped.
- db-smoke §10 (acceptance columns carry no SELECT or UPDATE grant, and the trigger restores them
  under an `authenticated` JWT even so) and §14 (return records unreadable by outsiders, unwritable
  by the buyer, with the `SET ROLE` switch that stops it passing vacuously).
- The `dmca-quarantine` bucket's *policies*: none exist, the exact-set matrix in §7 would flag any
  that appeared, and every other `storage.objects` policy is scoped by `bucket_id` to a different
  bucket. Only the `public` flag is unpinned (P3 above).
- `dmca_substantiated_count` is `REVOKE ... FROM PUBLIC` in both `00068` and `00069`, closing r4's
  P0 permanently; §13 pins the exclusion set including `counter_received`.
- DMCA `remove_material`'s `pre_dmca_status` preservation and quarantine-path merge, and the
  "other live notices" checks on both the `restore` and the `withdraw`/`defective` paths — I walked
  two-notice and second-removal sequences and could not reproduce r6's or r8's P1s.
- `requireAdmin()` in the DMCA route fails closed when the `profiles` read errors (`profile?.role`
  is `undefined`), and the table itself is admin-only at RLS with no client grants.
- `cancel-unshipped`: participant check is sound (session-scoped read, then explicit
  `isBuyer || isArtist`), and the new `isArtist && refund_approved_at` 409 does not touch the
  buyer's §3 right.
- `src/middleware.ts`: the longest-prefix rule, the limit-in-the-key decision, the static Upstash
  credential reads (Edge inlining), and fail-open on Redis errors — all correct and all documented.
- `createAdminSupabaseClient` is imported only from server files; `sessionRetry` is unchanged and
  still used only near signup.
- `artist/submit` still enforces a current-version Artist Agreement acceptance server-side and
  compare-and-swaps the status transition.
