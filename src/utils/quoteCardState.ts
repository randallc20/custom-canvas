/**
 * What an in-thread commission quote card should show.
 *
 * The card used to keep this in local `useState`, so it only remembered a
 * decision for as long as the component stayed mounted. A reload — or opening
 * the thread on another device — put **Accept** and **Decline** back on a quote
 * that had already been accepted. Pressing Accept then hit the route's
 * transition guard and returned 409 "This commission is not awaiting your
 * confirmation", and the caller threw that sentence away in favour of "Action
 * failed. Try again." A tester on prod reported it as "not letting me accept
 * quote" on a commission the database already had `in_progress`.
 *
 * `quoted` is the only status where a decision is still open. `delivered` is
 * the rail's confirm-receipt step — the same endpoint serves it, which is why
 * the card must not offer it too.
 */
export type QuoteCardState = 'open' | 'Accepted' | 'Declined';

export function quoteCardState(commissionStatus: string | null | undefined): QuoteCardState {
  if (!commissionStatus || commissionStatus === 'quoted') return 'open';
  if (commissionStatus === 'declined' || commissionStatus === 'cancelled') return 'Declined';
  return 'Accepted';
}
