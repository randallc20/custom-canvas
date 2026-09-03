import { supabase } from '@/lib/supabase';
import type { AcceptanceDocument, OutstandingAcceptance } from '@/lib/acceptance';

/** Client-side view of the acceptance record. The columns themselves are not
 *  client-readable (00058 grants nothing), so both halves go through
 *  /api/account/acceptance: the browser asks what is outstanding and posts
 *  that it accepts. Versions are stamped server-side from the constants. */

export type AcceptanceState = {
  outstanding: OutstandingAcceptance[];
  /** True when the outstanding set blocks purchases, listings, messages,
   *  reviews and commission actions. */
  blocks: boolean;
};

export async function fetchAcceptance(): Promise<AcceptanceState> {
  const res = await fetch('/api/account/acceptance', { cache: 'no-store' });
  if (!res.ok) return { outstanding: [], blocks: false };
  return res.json();
}

async function post(documents?: AcceptanceDocument[]): Promise<void> {
  const res = await fetch('/api/account/acceptance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(documents ? { documents } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Could not record your acceptance. Please try again.');
  }
}

/** Accept everything outstanding — what the interstitial does. */
export async function acceptOutstanding(): Promise<void> {
  return post();
}

/** Record the Terms of Service acceptance the registration checkbox covers.
 *
 *  Called immediately after sign-up, so the session cookie may not be attached
 *  to the very first request yet — the route would see an anonymous caller and
 *  401. Same disease as every other near-signup write (see
 *  src/lib/sessionRetry.ts), same remedy: refresh the session and try once
 *  more.
 *
 *  Deliberately does not throw. A failure here is not a reason to fail a
 *  registration that has otherwise succeeded — the person simply meets the
 *  acceptance interstitial on their next visit, which is the correct fallback
 *  rather than a lost account. */
export async function recordTermsAcceptance(): Promise<void> {
  try {
    await post(['terms']);
  } catch {
    try {
      await supabase.auth.refreshSession();
      await post(['terms']);
    } catch {
      /* interstitial will ask again — see above */
    }
  }
}
