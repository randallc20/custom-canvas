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

/** Record the Artist Agreement acceptance the onboarding click-wrap covers.
 *
 *  The browser used to send `agreement_version` and `agreement_accepted_at`
 *  in the artist_profiles INSERT, which meant an account could record — and
 *  backdate — acceptance of an agreement it had never been shown, and 00037's
 *  freeze then made that the permanent record. 00067 nulls both on a
 *  non-privileged insert; this stamps them server-side from the constant.
 *
 *  Retried once through a session refresh: this fires moments after the
 *  profile insert, which is the same near-signup window
 *  src/lib/sessionRetry.ts exists for. It does not throw — onboarding has
 *  already succeeded by this point, and the acceptance interstitial asks
 *  again on the next visit if this fails. */
export async function recordArtistAgreementAcceptance(): Promise<void> {
  try {
    await post(['artist_agreement']);
  } catch {
    try {
      await supabase.auth.refreshSession();
      await post(['artist_agreement']);
    } catch {
      /* the interstitial will ask — see above */
    }
  }
}
