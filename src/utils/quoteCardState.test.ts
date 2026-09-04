import { describe, expect, it } from 'vitest';
import { quoteCardState } from './quoteCardState';

describe('quoteCardState', () => {
  it('leaves the decision open while the quote is still quoted', () => {
    expect(quoteCardState('quoted')).toBe('open');
  });

  it('leaves it open on a request that has not been quoted yet', () => {
    // The regression that reached prod. The first cut of this function listed
    // the declined statuses and called everything else accepted, so `pending`
    // — a commission that has only been requested — rendered as "Accepted"
    // with no buttons. A buyer whose thread was open before the artist quoted
    // could never accept, and the artist sat on "Quote sent" forever.
    expect(quoteCardState('pending')).toBe('open');
  });

  it('is open when the commission has not loaded yet', () => {
    expect(quoteCardState(undefined)).toBe('open');
    expect(quoteCardState(null)).toBe('open');
  });

  it('is open on a status it does not recognise', () => {
    // Fail toward the button. A control the route may refuse is recoverable;
    // a card with no control at all strands both parties.
    expect(quoteCardState('some_future_status')).toBe('open');
  });

  it('closes the decision once the quote was accepted, and stays closed after', () => {
    expect(quoteCardState('accepted')).toBe('Accepted');
    expect(quoteCardState('in_progress')).toBe('Accepted');
    expect(quoteCardState('delivered')).toBe('Accepted');
    expect(quoteCardState('confirmed')).toBe('Accepted');
    expect(quoteCardState('completed')).toBe('Accepted');
  });

  it('reads a dispute as accepted work, not an open offer', () => {
    expect(quoteCardState('disputed')).toBe('Accepted');
  });

  it('reads cancelled as a decline', () => {
    expect(quoteCardState('cancelled')).toBe('Declined');
  });

  it('never re-offers Accept on a delivered commission', () => {
    // `delivered` is the rail's confirm-receipt step and shares the endpoint;
    // offering it here would send the buyer to a different transition than the
    // button claims.
    expect(quoteCardState('delivered')).not.toBe('open');
  });
});
