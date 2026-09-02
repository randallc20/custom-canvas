# Full-codebase review prompt (Fable 5.1)

Report-only review, run as **five separate sessions** — one per pass. Each session is
fresh: paste the template below with one pass's Scope block dropped into it. Reports
accumulate in `docs/reviews/`.

Why split: `src/` is ~24k LOC across 327 files plus 48 migrations. One session over all
of it produces a thorough first third and a skim after that. Five scoped passes each get
a whole context window aimed at one question.

Run order — 1 and 2 are where the value is. 4 is the most-reviewed area of the codebase
already (the 2026-08-25 adversarial sweep lived there), so it goes late.

---

## The template

Replace `{{PASS NAME}}`, `{{SLUG}}`, and `{{SCOPE}}` from the pass blocks below.

```
You are reviewing the Custom Canvas codebase — a Houston art marketplace: Next.js 14
App Router, Supabase (Postgres + RLS + storage + auth), Stripe Connect, React Query,
Tailwind. ~327 TS/TSX files, ~24k LOC in src/, 48 SQL migrations, Playwright e2e.
It is live on production but payments are still gated off pending Stripe activation.

Your job this session is one pass: {{PASS NAME}}. Read only the scope below, and
produce a written report. Nothing else.

## Scope

{{SCOPE}}

## Ground rules

**Report only.** The one file you may write is `docs/reviews/{{SLUG}}.md`. Do not fix
anything, do not refactor, do not run a codemod. If a fix is one obvious line, describe
it in the finding — do not apply it.

**Read before you claim.** A finding is real only if you have read the code that would
break *and its callers*. "This doesn't validate X" is not a finding when the caller
validates X. Reading a file's imports is not reading the file.

**Try to disprove each finding before you write it.** For every candidate, make one
honest attempt at arguing it is NOT a bug — a guard elsewhere, an RLS policy, a type
that makes the input impossible, a caller that already handles it. Drop the ones you
cannot defend after that attempt. Six findings that are all real beat thirty where I
have to work out which six.

**Every finding needs a concrete failure path.** Not "this could be a problem." Say who
does what and what goes wrong: "an artist opens another artist's listing edit URL; the
fetch filters on id but not owner, so the page renders their listing; the save then
returns zero rows at RLS and the UI shows a success toast." If you cannot write that
sentence, it is not a finding — it is a nit, and nits go in the appendix.

**Uncertainty is fine; faking certainty is not.** If you suspect something but cannot
confirm it without running the app or seeing production data, mark it UNVERIFIED and say
exactly what would settle it.

## Already settled — do not raise these

Decisions, not oversights. Flagging them wastes the pass:

- Destination charges with the platform as merchant of record. Not direct charges.
- Stripe Express connected accounts, Stripe-hosted onboarding. Not embedded components.
- The buyer covers Stripe's processing fee as a "Service fee" line. Platform commission
  is 15% of the artwork price only, never shipping. The artist is paid
  price − commission + shipping.
- Payments are deliberately gated behind NEXT_PUBLIC_PAYMENTS_ENABLED until live
  activation. That flag being false is not a bug.
- npm, never pnpm (a stray pnpm-lock.yaml flips Vercel's package manager). Prod deploys
  are manual and pinned.
- Next.js 14 App Router + Supabase + React Query + Tailwind. Do not propose migrating
  the framework, the data layer, the state library, or the CSS approach.
- `docs/CONVENTIONS.md` is the house standard, earned from a real defect sweep. Code
  that follows it is correct by definition. Code that VIOLATES it is a finding worth
  raising — check for that specifically.

Also out of scope: formatting and naming taste, "add a comment here", dependency bumps,
test-file style, and anything you would phrase as "consider extracting".

## Context to read first

`docs/CONVENTIONS.md`, `README.md`, `DECISIONS.md`. Then know this history: a
full-platform adversarial review ran 2026-08-25 and all 15 of its defects are fixed; a
six-phase hardening arc shipped after it; two rounds of live tester feedback are closed;
a real staging purchase plus dispute and payout reversal were verified end to end.
Assume the obvious surface bugs are gone. Look where those passes did not.

## Severity

- **P0** — loses money, exposes another user's data, or corrupts state. Launch-blocking.
- **P1** — a real user hits it in a normal flow and the product is visibly broken.
- **P2** — breaks under growth or under an unusual-but-real input; fine at today's volume.
- **P3** — maintainability: the next change in this code is likely to introduce a bug.

Cap the report at 12 findings, ranked, P0 first. More than that and the strongest 12 get
full write-ups while the rest get one line each in the appendix. A pass that honestly
finds two P0s and nothing else is a good pass. Do not pad to fill the cap.

## Report format

Write `docs/reviews/{{SLUG}}.md`:

    # {{PASS NAME}} — review <date>

    **Files read:** every file you actually opened. If you skipped part of the scope,
    say which part and why.
    **Verdict:** two sentences on the health of this slice.

    ### P<n> — <one-line claim>
    **Where:** `path/to/file.ts:120-134`
    **What happens:** the concrete failure path.
    **Why it's real:** what you read that rules out the innocent explanation.
    **Fix direction:** two sentences. Not a patch.

    ## Appendix: minor
    One line each.

    ## Not findings
    Things you looked at hard and concluded were fine, one line each. This is how I
    know what you actually covered.

Start by listing the files in scope and giving me your reading plan. Then read. Then
report.
```

---

## Pass 1 — Accounts, auth & access control

`{{SLUG}}` = `01-auth-access`

```
Files: src/middleware.ts; every src/app/api/**/route.ts (52 of them); src/lib/supabase.ts,
supabase-server.ts, supabase-admin.ts, sessionRetry.ts; src/context/AuthContext.tsx;
src/app/auth/** and src/app/(auth)/**; the RLS policies and grants across
supabase/migrations/**.

Answer these, route by route:

- Every route that mutates: does it verify identity AND role before it reaches
  createAdminSupabaseClient()? The admin client bypasses RLS — enumerate every use and
  name the check that guards it.
- IDOR across every `[id]` route: is ownership checked, or only existence? Test the
  question "what if this id belongs to someone else" against each one.
- The storage routes (avatar, banner, artist-photo, listing-image, chat-attachment):
  content type, size limit, and does the destination path bind to the caller's id or to
  something they control?
- src/middleware.ts is the only place rate limiting appears. Which mutating routes does
  its matcher actually cover, and which get none? Signup, login, password reset, message
  send and review submit are the ones I care about.
- Account lifecycle: sign-out completeness (a fake sign-out that left the session live
  was a real defect here before), the auth callback's redirect target (open redirect),
  email enumeration in signup and reset, the admin reset-password route, and what
  /api/account/delete leaves behind.
- Anything sensitive reachable from a NEXT_PUBLIC_ variable or shipped into a client
  bundle.
- The Stripe webhook: signature verification and replay handling.
- Where does the app rely on RLS to deny, versus the app just never asking? Name any
  table whose policies would allow a read the UI merely doesn't offer.
```

## Pass 2 — Scalability & the data layer

`{{SLUG}}` = `02-scale-data`

```
Files: src/services/** (20 files), src/hooks/** (24 files), src/lib/queryClient.ts,
src/services/feed.ts and the feed/gallery/search/artist-profile read paths, plus the
index definitions in supabase/migrations/**.

Answer these with named queries, not generalities:

- N+1: any list surface that fetches per row rather than in one query.
- Unbounded reads: queries with no .limit() and no pagination; select('*') on wide rows
  shipped to the browser; count queries that will scan.
- Client-side filtering or sorting of a set that grows without bound.
- Realtime: how many subscriptions does a page open, are they per-component, and are
  they torn down?
- React Query: are the keys correct, do mutations invalidate what they should, and is
  anything refetching in a loop or serving stale money/order data?
- Index coverage: for each filter and order-by that services/** actually issues, is
  there an index? Name the query and the missing index.
- Then answer directly: at 100 artists / 10,000 listings / 50,000 orders, what breaks
  FIRST? Name the exact query and the page it sits behind.
```

## Pass 3 — Frontend quality

`{{SLUG}}` = `03-frontend`

```
Files: src/components/** (18 directories), src/app/(public)/**, src/app/(artist)/**,
src/app/(user)/**, src/context/**. Start with the largest: ArtistProfileEdit.tsx,
CommissionPanel.tsx, SalesSection.tsx, GalleryDashboard.tsx, ArtFeed.tsx,
PartnerPicksManager.tsx, SetupChecklist.tsx.

Answer these:

- States: for every surface that fetches data, does it have a loading state, an empty
  state, and an error state? List the ones that render nothing, spin forever, or go
  blank when the fetch fails.
- Forms: double-submit protection, disabled-while-pending, validation errors the user
  can actually see and locate, and destructive actions without confirmation.
- Accessibility: keyboard reachability of every interactive element, focus management
  and escape handling in modals and drawers, form labels, image alt text, visible focus
  rings, and text contrast against the brand palette.
- Mobile at 375px: anything that overflows horizontally, gets clipped, or ends up
  untappable.
- Images: next/image usage, missing sizes, and layout shift on the feed and gallery.
- 126 files carry 'use client'. Which are client-side for no reason, and does any of
  them ship logic or data to the browser that belongs on the server?
- Consistency: the same interaction implemented two different ways in two places.
```

## Pass 4 — Money & order lifecycle

`{{SLUG}}` = `04-money`

```
Files: src/app/api/webhooks/stripe/route.ts (587 lines — read all of it),
src/app/api/payments/**, src/app/api/orders/**, src/app/api/commissions/**,
src/utils/commissionCalc*, src/utils/orderRecord*, src/services/orders.ts, payments.ts,
commissions.ts.

This is the most-reviewed area of the codebase — the 2026-08-25 sweep found order
forgery and a dropped status guard here and both are fixed. Do not re-report those.
Go after what a single-pass review misses:

- Webhook idempotency and out-of-order delivery. What happens on a duplicate event, and
  on an event that arrives before the one it logically follows?
- What happens if a webhook is never delivered at all — is there reconciliation, or does
  the order sit wrong forever?
- The order and commission state machines: enumerate the transitions, then find a
  sequence a buyer or artist can drive that skips a required step or reaches a state
  with no exit.
- Refunds and disputes, including partial refunds and a refund after payout.
- The payout math against the locked rules above — verify it, don't redesign it.
- Races: checkout in flight while the listing is edited, deleted, or sold to someone else.
```

## Pass 5 — Code health

`{{SLUG}}` = `05-code-health`

```
Files: the 20 largest files in src/ (start with src/services/email.ts at 426 lines),
src/services/**, src/utils/**, src/schemas/**, src/types/**, and e2e/**.

Answer these:

- Real duplication: the same logic in three or more places, especially where the copies
  have already diverged.
- Type safety: `any`, `as` casts, and non-null assertions that are hiding nullability
  the database actually allows.
- Error handling that swallows — bare catch blocks, and mutations with no error path
  reaching the user. docs/CONVENTIONS.md has the specific rule; find the violations.
- Do the Zod schemas in src/schemas/** agree with what the database actually enforces
  (nullability, length, enum values)? Name every disagreement.
- Dead code and unreachable branches.
- Test gaps: where would a bug be both silent and expensive, and is there no test there?
  13 e2e specs and a vitest suite exist — say what they do NOT cover.
```

---

## Between passes

- Reports land in `docs/reviews/`. Triage them yourself before any code changes — a
  report is a list of claims, not a work order.
- Any **P0**, and anything marked **UNVERIFIED**, is worth a second opinion from a
  stronger model before you act on it. Fable is fast and broad; the trade is that a
  confidently-worded finding can still be wrong.
- Fixes go in their own session, from an approved list — never in the review session.
- Housekeeping first: the working tree currently has uncommitted deletions under
  `docs/legal/`. Commit or restore those before you start, so a review session doesn't
  trip over them or sweep them into a commit.
