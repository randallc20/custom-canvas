import type { CommissionStatus } from '@/types/commission';

/**
 * What an in-thread commission quote card should show.
 *
 * The card used to keep this in local `useState`, so it only remembered a
 * decision while the component stayed mounted: a reload put **Accept** and
 * **Decline** back on a quote already accepted, pressing it 409'd, and the
 * caller threw that sentence away for "Action failed. Try again."
 *
 * The first fix for that was worse than the bug. It listed the statuses that
 * mean "declined" and treated EVERYTHING ELSE as accepted — including
 * `pending`, which is the status of a commission that has only been requested.
 * So a buyer whose thread was open before the artist quoted saw a card reading
 * "Accepted" with no buttons at all, while the artist's side sat on "Quote
 * sent" forever and neither party could move. Reported on prod within hours.
 *
 * Every status is now named. `accepted` is the DB's own value; the four that
 * follow it are what the commission moves through afterwards, and `disputed`
 * only happens to work that was accepted. Anything unrecognised falls to
 * `open`: showing a button that the route may refuse is recoverable, and
 * hiding the only control on the card is not.
 */
export type QuoteCardState = 'open' | 'Accepted' | 'Declined';

export function quoteCardState(commissionStatus: string | null | undefined): QuoteCardState {
  switch (commissionStatus as CommissionStatus) {
    // Nothing has been decided yet. `pending` is a request with no quote on it;
    // `quoted` is the decision this card exists to offer.
    case 'pending':
    case 'quoted':
      return 'open';
    case 'accepted':
    case 'in_progress':
    case 'delivered':
    case 'confirmed':
    case 'completed':
    case 'disputed':
      return 'Accepted';
    case 'cancelled':
      return 'Declined';
    default:
      return 'open';
  }
}
