/**
 * A gate for overlapping async results, where only the newest may be applied.
 *
 * Written for `AuthContext`, and the bug it exists to stop is worth knowing
 * before you touch it. Every auth event starts a profile fetch. `profiles` is
 * readable with the ANON key — 00001's `USING (true)` SELECT policy plus
 * 00031's column grants, because public identity is a feature — so a fetch
 * issued while signed IN still resolves SUCCESSFULLY after sign-out. Its
 * `setUser` then put the person straight back into the header: avatar menu,
 * Messages link, no Log In. The session was genuinely gone; only the UI
 * believed otherwise, until a reload. It surfaced as an intermittent e2e
 * failure on "the artist signs out cleanly", which is exactly how long it can
 * hide for.
 *
 * `isMounted` does not help here: the provider stays mounted across a
 * sign-out. The question is not "am I still here" but "am I still the answer
 * anyone is waiting for".
 *
 *   const gate = createLatestOnly();
 *   const ticket = gate.begin();
 *   const data = await fetch();
 *   if (gate.isCurrent(ticket)) setUser(data);   // else: discard, silently
 *
 * and on sign-out, `gate.supersede()` before clearing — which retires every
 * fetch already in flight, so none of them can set a user OR clear one.
 */
export type LatestOnly = {
  /** Claim the newest ticket. Every prior ticket is now stale. */
  begin: () => number;
  /** Whether this ticket is still the newest. */
  isCurrent: (ticket: number) => boolean;
  /** Retire everything in flight without issuing a ticket to anyone. */
  supersede: () => void;
};

export function createLatestOnly(): LatestOnly {
  let current = 0;
  return {
    begin: () => (current += 1),
    isCurrent: (ticket: number) => ticket === current,
    supersede: () => {
      current += 1;
    },
  };
}
