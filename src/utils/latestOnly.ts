/**
 * A guard for async results that outlive the session they were started for.
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
 * `isMounted` does not help: the provider stays mounted across a sign-out.
 * The question is not "am I still here" but "is the session I was started for
 * still the session".
 *
 *   const epoch = createSessionEpoch();
 *   const mine = epoch.current();
 *   const data = await fetch();
 *   if (epoch.isCurrent(mine)) setUser(data);   // else: discard, silently
 *
 * and on sign-out, `epoch.invalidate()` before clearing.
 *
 * Deliberately NOT newest-wins between overlapping fetches. Two fetches inside
 * one epoch are for the same session and the same user, so either answer is
 * the right answer — and an earlier draft that retired the older one on every
 * new fetch could discard a SUCCESS in favour of a later FAILURE, leaving the
 * app signed-in-but-userless with nothing to retry. Only sign-out invalidates.
 */
export type SessionEpoch = {
  /** The epoch to carry alongside an in-flight request. */
  current: () => number;
  /** Whether that epoch is still the live one. */
  isCurrent: (epoch: number) => boolean;
  /** End the epoch: everything in flight is now answering a dead question. */
  invalidate: () => void;
};

export function createSessionEpoch(): SessionEpoch {
  let epoch = 0;
  return {
    current: () => epoch,
    isCurrent: (e: number) => e === epoch,
    invalidate: () => {
      epoch += 1;
    },
  };
}
