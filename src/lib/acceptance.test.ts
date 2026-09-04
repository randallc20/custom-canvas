import { describe, expect, it, vi } from 'vitest';

// `acceptanceGateFor` builds its own service-role client.
const adminBehaviour = { throwOnRead: false };
// Answers PER TABLE. Ignoring the table argument handed the artist_profiles
// lookup the profiles row, so the "buyer" fixture also owed the Artist
// Agreement — the assertions held but the state was not one the product can
// produce (r9 auth pass, appendix).
vi.mock('@/lib/supabase-admin', () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (adminBehaviour.throwOnRead) return { data: null, error: { message: 'statement timeout' } };
            if (table === 'artist_profiles') return { data: null, error: null };
            return { data: { role: 'user', terms_version: null, terms_of_sale_version: null }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptanceBlocks, acceptanceGateFor, outstandingAcceptances } from './acceptance';
import {
  ARTIST_AGREEMENT_VERSION,
  TERMS_OF_SALE_VERSION,
  TERMS_VERSION,
} from './agreement';

/** A service-role client stubbed down to the two reads outstandingAcceptances
 *  makes: the profile row, and the artist row when the role is artist. */
function stubClient(rows: {
  profile: Record<string, unknown> | null;
  artist?: Record<string, unknown> | null;
}): SupabaseClient {
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: name === 'profiles' ? rows.profile : (rows.artist ?? null),
          error: null,
        }),
      }),
    }),
  });
  return { from: table } as unknown as SupabaseClient;
}

const CURRENT_BUYER = {
  role: 'user',
  terms_version: TERMS_VERSION,
  terms_of_sale_version: TERMS_OF_SALE_VERSION,
};

describe('outstandingAcceptances', () => {
  it('asks an existing buyer who accepted nothing for both buyer documents', async () => {
    const out = await outstandingAcceptances(
      stubClient({ profile: { role: 'user', terms_version: null, terms_of_sale_version: null } }),
      'u1',
    );
    expect(out.map((o) => o.document)).toEqual(['terms', 'terms_of_sale']);
    expect(out[0].version).toBe(TERMS_VERSION);
  });

  it('asks nothing of a fully current buyer', async () => {
    const out = await outstandingAcceptances(stubClient({ profile: CURRENT_BUYER }), 'u1');
    expect(out).toEqual([]);
  });

  it('asks an artist for the Terms of Service and the Artist Agreement, not the Terms of Sale', async () => {
    // The v1.0 artist from the previous arc: agreement recorded, but at the
    // superseded version, and the Terms of Service never accepted at all.
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'artist', terms_version: null, terms_of_sale_version: null },
        artist: { agreement_version: '1.0' },
      }),
      'a1',
    );
    expect(out.map((o) => o.document)).toEqual(['terms', 'artist_agreement']);
  });

  it('does not chase an artist who has not onboarded yet', async () => {
    // No artist_profiles row: the agreement is accepted AT onboarding, so
    // there is nothing outstanding to interrupt them with beforehand.
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'artist', terms_version: TERMS_VERSION, terms_of_sale_version: null },
        artist: null,
      }),
      'a1',
    );
    expect(out).toEqual([]);
  });

  it('leaves a current artist alone', async () => {
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'artist', terms_version: TERMS_VERSION, terms_of_sale_version: null },
        artist: { agreement_version: ARTIST_AGREEMENT_VERSION },
      }),
      'a1',
    );
    expect(out).toEqual([]);
  });

  it('carries the incorporated policies so the interstitial can name them', async () => {
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'artist', terms_version: TERMS_VERSION, terms_of_sale_version: null },
        artist: { agreement_version: '1.0' },
      }),
      'a1',
    );
    const agreement = out.find((o) => o.document === 'artist_agreement');
    expect(agreement?.incorporates?.map((i) => i.href)).toEqual(['/seller-protection']);
  });

  it('returns nothing for a profile that does not exist', async () => {
    expect(await outstandingAcceptances(stubClient({ profile: null }), 'gone')).toEqual([]);
  });
});

describe('acceptanceBlocks', () => {
  it('blocks on the Terms of Service', async () => {
    const out = await outstandingAcceptances(
      stubClient({ profile: { role: 'user', terms_version: null, terms_of_sale_version: null } }),
      'u1',
    );
    expect(acceptanceBlocks(out)).toBe(true);
  });

  it('blocks on a stale Artist Agreement', async () => {
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'artist', terms_version: TERMS_VERSION, terms_of_sale_version: null },
        artist: { agreement_version: '1.0' },
      }),
      'a1',
    );
    expect(acceptanceBlocks(out)).toBe(true);
  });

  it('does NOT block on the Terms of Sale alone', async () => {
    // Terms of Sale 1: "you accept them at checkout". A brand-new buyer who
    // has accepted the Terms of Service must still be able to message an
    // artist before they have ever bought anything — blocking here was the
    // easy mistake, and checkout stamps this document instead of refusing.
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'user', terms_version: TERMS_VERSION, terms_of_sale_version: null },
      }),
      'u1',
    );
    expect(out.map((o) => o.document)).toEqual(['terms_of_sale']);
    expect(acceptanceBlocks(out)).toBe(false);
  });

  it('does not block an account with nothing outstanding', () => {
    expect(acceptanceBlocks([])).toBe(false);
  });
});

/**
 * r4 auth pass, P3. `Artists can insert own profile` is
 * `WITH CHECK (auth.uid() = profile_id)` with no role condition, so a
 * `user`-role account can finish the onboarding wizard. Once 00067 stopped
 * the browser stamping its own acceptance, keying this on profiles.role left
 * such an account permanently unable to accept the agreement — the
 * interstitial never asked, and submit-for-review refused them forever.
 */
describe('the Artist Agreement follows the artist PROFILE, not the role', () => {
  it('asks a user-role account that somehow has an artist profile', async () => {
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'user', terms_version: TERMS_VERSION, terms_of_sale_version: TERMS_OF_SALE_VERSION },
        artist: { agreement_version: null },
      }),
      'u1',
    );
    expect(out.map((o) => o.document)).toEqual(['artist_agreement']);
  });

  it('still asks nothing of a buyer with no artist profile', async () => {
    const out = await outstandingAcceptances(
      stubClient({
        profile: { role: 'user', terms_version: TERMS_VERSION, terms_of_sale_version: TERMS_OF_SALE_VERSION },
        artist: null,
      }),
      'u1',
    );
    expect(out).toEqual([]);
  });
});

/**
 * r6 auth pass, P3. supabase-js returns { data: null, error } rather than
 * throwing, so a statement timeout used to read as "owes nothing" — the POST
 * answered 200, the dialog closed, and the person was thanked for an
 * acceptance that was never written.
 */
describe('a failed lookup is not "owes nothing"', () => {
  function failingClient(): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'statement timeout' } }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it('throws rather than reporting an empty outstanding set', async () => {
    await expect(outstandingAcceptances(failingClient(), 'u1')).rejects.toMatchObject({
      message: 'statement timeout',
    });
  });
});

describe('acceptanceGateFor', () => {
  it('refuses with 403 and the interstitial code when an acceptance is genuinely outstanding', async () => {
    adminBehaviour.throwOnRead = false;
    const gate = await acceptanceGateFor('u1');
    expect(gate?.status).toBe(403);
    expect(gate?.body.code).toBe('acceptance_required');
    // A plain buyer with no artist profile: Terms of Service (which blocks)
    // and Terms of Sale (which does not).
    expect(gate?.body.outstanding.map((o) => o.document)).toEqual(['terms', 'terms_of_sale']);
  });

  it('refuses with 503 rather than throwing when the lookup fails', async () => {
    // `outstandingAcceptances` throws by design so the write endpoints fail
    // closed. Nothing caught it, so a statement timeout on `profiles` was an
    // unhandled exception in all thirteen gated routes at once — message send,
    // listing create and edit, checkout, reviews, every commission action —
    // and Next answered each with a bare 500 and no body (r8 auth pass).
    adminBehaviour.throwOnRead = true;
    const gate = await acceptanceGateFor('u1');
    expect(gate?.status).toBe(503);
    expect(gate?.body.code).toBe('acceptance_unavailable');
    // No interstitial: there is nothing here the person can accept.
    expect(gate?.body.outstanding).toEqual([]);
    adminBehaviour.throwOnRead = false;
  });
});
