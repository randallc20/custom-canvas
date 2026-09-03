import { describe, expect, it } from 'vitest';
import { createSessionEpoch } from './latestOnly';

describe('createSessionEpoch', () => {
  it('lets a result through while its session is still live', () => {
    const epoch = createSessionEpoch();
    const mine = epoch.current();
    expect(epoch.isCurrent(mine)).toBe(true);
  });

  it('retires an in-flight result on sign-out, so it cannot set a user', () => {
    // The one that mattered. `profiles` is anon-readable, so a fetch issued
    // while signed in still SUCCEEDS after sign-out — and used to put the
    // person back in the header with no session behind it.
    const epoch = createSessionEpoch();
    const inFlight = epoch.current();
    epoch.invalidate();
    expect(epoch.isCurrent(inFlight)).toBe(false);
  });

  it('does not hand the retired epoch back to the next session', () => {
    const epoch = createSessionEpoch();
    const before = epoch.current();
    epoch.invalidate();
    const after = epoch.current();
    expect(after).not.toBe(before);
    expect(epoch.isCurrent(before)).toBe(false);
    expect(epoch.isCurrent(after)).toBe(true);
  });

  it('lets BOTH of two overlapping fetches apply within one session', () => {
    // Not newest-wins, deliberately. `getSession()` and the INITIAL_SESSION
    // event both start a fetch for the same user; retiring the older one meant
    // a successful result could be discarded in favour of a later failure,
    // which leaves the app signed in with no user and nothing to retry — no
    // banner, no studio, no way back short of a reload.
    const epoch = createSessionEpoch();
    const first = epoch.current();
    const second = epoch.current();
    expect(epoch.isCurrent(first)).toBe(true);
    expect(epoch.isCurrent(second)).toBe(true);
  });

  it('retires both of them on sign-out', () => {
    const epoch = createSessionEpoch();
    const first = epoch.current();
    const second = epoch.current();
    epoch.invalidate();
    expect(epoch.isCurrent(first)).toBe(false);
    expect(epoch.isCurrent(second)).toBe(false);
  });
});
