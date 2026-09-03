/** Ruling D8 — showing mature work is the viewer's choice, kept in their
 *  browser.
 *
 *  Listing Standards Part three permits nudity and mature themes as fine art
 *  and requires them to be "tagged so it can be filtered". A blur was the
 *  other option; hide-by-default is what "so it can be filtered" actually
 *  asks for, since a softened image is still in front of someone who did not
 *  ask for it.
 *
 *  Deliberately NOT on the profile. It applies to anonymous visitors, who are
 *  most of the traffic and have no row to store it on; and it is a browsing
 *  preference, not a fact about a person, so it does not belong in a table we
 *  would then have to disclose in the Privacy Policy and delete on request.
 *  Same reasoning and same mechanism as the buyer's chosen community
 *  (src/lib/location.ts).
 */
export const MATURE_STORAGE_KEY = 'cc_show_mature';

export function readMaturePreference(): boolean {
  try {
    return localStorage.getItem(MATURE_STORAGE_KEY) === '1';
  } catch {
    // Private mode / storage disabled: default to hiding it, which is the
    // safe direction.
    return false;
  }
}

export function writeMaturePreference(show: boolean): void {
  try {
    if (show) localStorage.setItem(MATURE_STORAGE_KEY, '1');
    else localStorage.removeItem(MATURE_STORAGE_KEY);
  } catch {
    // Storage unavailable — the context still holds it for this session.
  }
}
