import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminSupabaseClient } from './supabase-admin';
import {
  AGREEMENT_SUMMARY,
  ARTIST_AGREEMENT_VERSION,
  SELLER_PROTECTION_VERSION,
  TERMS_OF_SALE_SUMMARY,
  TERMS_OF_SALE_VERSION,
  TERMS_VERSION,
} from './agreement';

// Server-side only: takes a service-role client. Never import from client
// code (same rule as src/lib/supabase-admin.ts).

/** The documents whose acceptance is recorded against an account. The Privacy
 *  Policy is named in the Terms of Service checkbox and stamped with it; the
 *  Seller Protection Policy is "versioned with" the Artist Agreement (§4) and
 *  covered by its stamp. */
export type AcceptanceDocument = 'terms' | 'terms_of_sale' | 'artist_agreement';

export type OutstandingAcceptance = {
  document: AcceptanceDocument;
  version: string;
  title: string;
  /** Where the full text lives. */
  href: string;
  /** Plain-language points shown at the moment of acceptance. */
  summary: readonly string[];
  /** Extra documents this acceptance carries with it. */
  incorporates?: { title: string; href: string; version: string }[];
};

const DOCUMENTS: Record<AcceptanceDocument, Omit<OutstandingAcceptance, 'document'>> = {
  terms: {
    version: TERMS_VERSION,
    title: 'Terms of Service',
    href: '/terms',
    summary: [
      'Custom Canvas is a marketplace for original physical artwork by local artists. We operate the platform; artists sell their own work.',
      'You must be 18 or older to hold an account.',
      'Version 2.0 adds an agreement to resolve disputes by individual arbitration and a waiver of class actions. You can bring a claim in small claims court instead, and you can opt out of arbitration as described in §15.',
      'Your privacy is covered by the Privacy Policy, which explains what we collect, who processes it, and how long we keep it.',
    ],
    incorporates: [{ title: 'Privacy Policy', href: '/privacy', version: '2.0' }],
  },
  terms_of_sale: {
    version: TERMS_OF_SALE_VERSION,
    title: 'Terms of Sale',
    href: '/terms-of-sale',
    summary: TERMS_OF_SALE_SUMMARY,
    incorporates: [
      { title: 'Shipping, Returns & Refunds', href: '/shipping-returns', version: '1.0' },
      { title: 'Listing Standards', href: '/listing-standards', version: '1.0' },
    ],
  },
  artist_agreement: {
    version: ARTIST_AGREEMENT_VERSION,
    title: 'Artist Agreement',
    href: '/artist-agreement',
    summary: AGREEMENT_SUMMARY,
    incorporates: [
      {
        title: 'Seller Protection Policy',
        href: '/seller-protection',
        version: SELLER_PROTECTION_VERSION,
      },
    ],
  },
};

export function acceptanceDocument(document: AcceptanceDocument): OutstandingAcceptance {
  return { document, ...DOCUMENTS[document] };
}

/** What this account still owes, in the order it should be shown.
 *
 *  Ruling D11: an existing account accepted nothing (buyers) or v1.0 (artists),
 *  and Terms of Service v2.0 is a material change under §17, so acceptance has
 *  to be obtained again. An artist is asked for the Terms of Service and the
 *  Artist Agreement (which carries Seller Protection); everyone else is asked
 *  for the Terms of Service and the Terms of Sale.
 *
 *  An artist is NOT asked for the Terms of Sale here — they accept it at
 *  checkout like any other buyer, the first time they buy something. */
export async function outstandingAcceptances(
  admin: SupabaseClient,
  userId: string,
): Promise<OutstandingAcceptance[]> {
  // supabase-js does not throw on a failed query — it returns { data: null,
  // error }. Treating that as "owes nothing" made a statement timeout during
  // the POST answer 200 with an empty list, close the dialog and tell the
  // person "your acceptance is recorded" when nothing had been stamped (r6
  // auth pass, P3). Throw instead: the read endpoint catches and fails open
  // by design, the write endpoint and the gate both fail closed.
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role, terms_version, terms_of_sale_version')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return [];

  const outstanding: AcceptanceDocument[] = [];
  if (profile.terms_version !== TERMS_VERSION) outstanding.push('terms');

  // Keyed on HAVING an artist profile, not on profiles.role. The RLS policy
  // behind that row is `auth.uid() = profile_id` with no role condition, so a
  // `user`-role account can complete the onboarding wizard — and once 00067
  // stopped the browser stamping its own acceptance, a role check here left
  // them permanently unable to accept: the interstitial never asked, the POST
  // filtered their request down to nothing, and submit-for-review refused
  // them forever with no surface anywhere that could fix it (r4 auth pass).
  //
  // No artist profile yet means onboarding has not run, and onboarding is
  // where the agreement is accepted — nothing to chase.
  const { data: artist, error: artistError } = await admin
    .from('artist_profiles')
    .select('agreement_version')
    .eq('profile_id', userId)
    .maybeSingle();
  if (artistError) throw artistError;
  if (artist && artist.agreement_version !== ARTIST_AGREEMENT_VERSION) {
    outstanding.push('artist_agreement');
  }

  // The Terms of Sale are the buyer's document; an artist meets them at
  // checkout like anyone else, so they are not asked for here.
  if (profile.role !== 'artist' && profile.terms_of_sale_version !== TERMS_OF_SALE_VERSION) {
    outstanding.push('terms_of_sale');
  }

  return outstanding.map(acceptanceDocument);
}

/** Whether an outstanding set blocks the gated actions — purchase, listing
 *  create/edit, message send, review submit, commission actions.
 *
 *  The Terms of Sale deliberately do not block: they are accepted at checkout
 *  (Terms of Sale §1, "you accept them at checkout"), and the checkout route
 *  stamps them rather than refusing. Blocking on them would stop a brand-new
 *  buyer from sending their first message, which no document asks for. */
export function acceptanceBlocks(outstanding: OutstandingAcceptance[]): boolean {
  return outstanding.some((o) => o.document === 'terms' || o.document === 'artist_agreement');
}

/** The 403 a gated write route returns while acceptance is outstanding, or
 *  null when the account is clear.
 *
 *  This is the enforcement half of ruling D11 — the interstitial is the
 *  visible half, but a client that never renders it (a stale tab, a scripted
 *  request) must still be refused. `code` lets the browser tell this apart
 *  from an ordinary permission error and open the interstitial instead of
 *  showing a dead-end toast.
 *
 *  Fails CLOSED: if the lookup itself throws, the write is refused. The read
 *  endpoint fails open for the opposite reason — it decides what to show, not
 *  what to allow. */
export async function acceptanceGate(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error: string; code: 'acceptance_required'; outstanding: OutstandingAcceptance[] } | null> {
  const outstanding = await outstandingAcceptances(admin, userId);
  if (!acceptanceBlocks(outstanding)) return null;
  return {
    error:
      'Our terms have been updated. Please review and accept them to continue — you can do it from the banner at the top of the page.',
    code: 'acceptance_required',
    outstanding,
  };
}

/** `acceptanceGate` with its own service-role client, for the gated write
 *  routes — two lines at the call site, right under the 401 check. */
export async function acceptanceGateFor(userId: string) {
  return acceptanceGate(createAdminSupabaseClient(), userId);
}

/** Stamp the Terms of Sale on a buyer who has just submitted an order.
 *
 *  Terms of Sale §1 says they are accepted at checkout, and the notice above
 *  the Pay button is the disclosure — so the acceptance is recorded when the
 *  order is submitted, not asked for beforehand. Idempotent: a buyer whose
 *  recorded version is already current is left alone, so the timestamp stays
 *  the date of their FIRST acceptance of this version.
 *
 *  Never throws. A failure here must not turn a working checkout into a 502;
 *  the buyer has seen the disclosure either way, and an unstamped account is
 *  simply asked again next time. */
export async function recordTermsOfSaleAcceptance(userId: string): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    await admin
      .from('profiles')
      .update({
        terms_of_sale_version: TERMS_OF_SALE_VERSION,
        terms_of_sale_accepted_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .or(`terms_of_sale_version.is.null,terms_of_sale_version.neq.${TERMS_OF_SALE_VERSION}`);
  } catch {
    // Deliberately swallowed — see above. Sentry would fire on the caller's
    // own error path if the checkout itself failed.
  }
}
