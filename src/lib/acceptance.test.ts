import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { acceptanceBlocks, outstandingAcceptances } from './acceptance';
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
