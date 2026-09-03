import { describe, expect, it } from 'vitest';
import { createLatestOnly } from './latestOnly';

describe('createLatestOnly', () => {
  it('lets a lone result through', () => {
    const gate = createLatestOnly();
    const t = gate.begin();
    expect(gate.isCurrent(t)).toBe(true);
  });

  it('discards a slow earlier result when a later one has started', () => {
    // Two auth events in quick succession: TOKEN_REFRESHED then SIGNED_IN.
    // The first fetch resolving last must not overwrite the second's answer.
    const gate = createLatestOnly();
    const first = gate.begin();
    const second = gate.begin();
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it('retires an in-flight result on sign-out, so it cannot set a user', () => {
    // The one that mattered. `profiles` is anon-readable, so a fetch issued
    // while signed in still SUCCEEDS after sign-out — and used to put the
    // person back in the header with no session behind it.
    const gate = createLatestOnly();
    const inFlight = gate.begin();
    gate.supersede();
    expect(gate.isCurrent(inFlight)).toBe(false);
  });

  it('does not hand the retired ticket to the next fetch', () => {
    // If supersede() left `current` where a subsequent begin() would reissue
    // the same number, the stale result would come back to life.
    const gate = createLatestOnly();
    const inFlight = gate.begin();
    gate.supersede();
    const next = gate.begin();
    expect(next).not.toBe(inFlight);
    expect(gate.isCurrent(inFlight)).toBe(false);
    expect(gate.isCurrent(next)).toBe(true);
  });
});
