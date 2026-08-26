# Code conventions

## Client-side writes must assert affected rows

Ten of the eleven defects in the 2026-08 full-app sweep were one disease: a
client-side Supabase `.update()` / `.delete()` that RLS, a column guard, or a
missing policy silently turned into a zero-row no-op — error swallowed or
absent, success toast on top.

The rule, for every client-side write through supabase-js:

1. **Assert affected rows.** Updates/deletes append `.select('id')` and treat
   zero returned rows as a failure:
   - single-row: `.select('id').maybeSingle()` → `if (error || !data) fail`
   - multi-row: `.select('id')` → `if (error) fail` + length check when zero
     rows can only mean refusal.
   If zero rows is a *legitimate* outcome (e.g. "mark all read" with nothing
   unread, replace-all delete with no prior rows), say so in a comment at the
   call site — silence is what this rule bans, not zero rows.
   Column-restricted tables (`profiles`, `artist_profiles`): select explicit
   granted columns, never bare `.select()` (= `RETURNING *` → 42501).
2. **Surface the failure.** Every write's error path must reach the user — a
   toast with a real message or a thrown error a caller toasts. Never bare
   `catch {}` around a write; never `.mutate()` on a mutation hook with no
   `onError` anywhere in the chain (hook-level `toastError` from
   `src/hooks/toastError.ts` covers fire-and-forget call sites).
3. **Near signup/login, retry once.** Wrap the write with `withSessionRetry`
   from `src/lib/sessionRetry.ts` — a fresh session cookie may not be attached
   yet, and RLS sees an anonymous request (INSERT → 42501, UPDATE → zero rows).
4. **Privileged writes go server-side.** Admin-only mutations belong behind an
   API route using `createAdminSupabaseClient()` after a role check (pattern:
   `src/app/api/galleries/route.ts` PATCH), not client-side RLS luck.

Fixed exemplars to copy: `src/services/artists.ts` (updateArtistProfile),
`src/components/account/EmailPreferences.tsx`, `src/app/admin/disputes/page.tsx`
(handleResolve), `src/services/partnerPicks.ts` (removePick/updatePick).

## Database changes ship with the smoke test

`./scripts/db-smoke.sh` (and `--prod` after a prod migration) is a pre-merge
step for ANY migration that touches functions, policies, or grants — CI
minutes are unavailable, so nothing runs it for you. It pins three things
(see `scripts/db-smoke.sql`): every public function parses/executes, the
exact RLS policy matrix, and the column grants on the column-restricted
tables. A deliberate schema change updates the expectations in the same PR.

## Repo gotchas

- Never run `pnpm` here (npm lockfile; a stray `pnpm-lock.yaml` flips Vercel's
  package manager and skips sharp's build script). Use `./node_modules/.bin/*`.
- Prod deploys are manual and pinned: `npx -y vercel@59.5.0 deploy --prod
  --token "$VERCEL_TOKEN" --yes` — prod is NOT git-linked.
- E2E: one spec file at a time, `--workers=1` (Supabase auth rate limits).
