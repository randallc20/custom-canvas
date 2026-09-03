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
