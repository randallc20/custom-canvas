import { describe, expect, it } from 'vitest';
import { quoteCardState } from './quoteCardState';

describe('quoteCardState', () => {
  it('leaves the decision open while the quote is still quoted', () => {
    expect(quoteCardState('quoted')).toBe('open');
  });

  it('is open when the commission has not loaded yet', () => {
    // Undefined is "we do not know", and hiding the buttons on a slow query
    // would look like the same bug from the other side.
    expect(quoteCardState(undefined)).toBe('open');
    expect(quoteCardState(null)).toBe('open');
  });

  it('closes the decision once the quote was accepted', () => {
    // The reported bug: after a reload this returned to `open` and the buyer
    // was offered a decision they had already made, which then 409'd.
    expect(quoteCardState('in_progress')).toBe('Accepted');
    expect(quoteCardState('delivered')).toBe('Accepted');
    expect(quoteCardState('completed')).toBe('Accepted');
  });

  it('reads declined and cancelled as a decline', () => {
    expect(quoteCardState('declined')).toBe('Declined');
    expect(quoteCardState('cancelled')).toBe('Declined');
  });

  it('never re-offers Accept on a delivered commission', () => {
    // `delivered` is the rail's confirm-receipt step and shares the endpoint;
    // offering it here would send the buyer to a different transition than the
    // button claims.
    expect(quoteCardState('delivered')).not.toBe('open');
  });
});
