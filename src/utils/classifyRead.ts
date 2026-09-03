// What a single-row PostgREST read actually said. supabase-js never throws:
// a network or pooler failure resolves `{ data: null, error }`, which looks
// exactly like "no such row" to a handler that branches on `!data` alone —
// and the checkout webhook did, detaching a paid order from a listing that
// was still on sale, or calling a redelivered payment an oversell and
// refunding a real sale (04-r4 P2). Three answers, never two.

export type ReadOutcome = 'row' | 'absent' | 'failed';

/** PostgREST's "JSON object requested, multiple (or no) rows returned" — what
 *  `.single()` returns for zero rows. `.maybeSingle()` answers data null with
 *  no error instead; both mean the row is CONFIRMED absent. */
export const NO_ROWS_CODE = 'PGRST116';

export function classifyRead<T>(result: {
  data: T | null;
  error: { code?: string | null; message?: string | null } | null;
}): ReadOutcome {
  if (result.error) return result.error.code === NO_ROWS_CODE ? 'absent' : 'failed';
  return result.data === null || result.data === undefined ? 'absent' : 'row';
}
