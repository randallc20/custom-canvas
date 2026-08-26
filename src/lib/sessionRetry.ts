import { supabase } from '@/lib/supabase';

/**
 * Right after signup, a write can go out before the fresh session cookie is
 * attached, so RLS sees an anonymous request. The symptom differs by verb —
 * an INSERT fails with 42501, an UPDATE "succeeds" with zero rows — but the
 * remedy is the same: re-sync the session and retry exactly once. Keep every
 * RLS-adjacent write near signup on this one policy so the retry count and
 * detection logic can't drift between call sites.
 */
export async function withSessionRetry<T>(
  run: () => PromiseLike<T>,
  needsRetry: (result: T) => boolean
): Promise<T> {
  let result = await run();
  if (needsRetry(result)) {
    await supabase.auth.refreshSession();
    result = await run();
  }
  return result;
}

/** True when a PostgREST error is an RLS refusal (insert/update denied). */
export function isRlsDenial(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42501';
}
