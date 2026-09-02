import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';

/**
 * Fixture discovery for the specs.
 *
 * These used to be `GET /api/artists` and `GET /api/listings`. R7 deleted both
 * routes (nothing in the app called them; the pages read Supabase directly),
 * so the specs read the same rows from PostgREST with the ANON key instead.
 * Same data, same visibility: RLS hides listings whose artist is not live and
 * artist_profiles rows that are not live, which is exactly what the routes'
 * `.eq('is_live', true)` / `.eq('status', 'available')` filters did.
 *
 * Column lists are explicit on purpose: `profiles` and `artist_profiles` are
 * column-restricted (migrations 00031/00033), so a `select=*` from an anon
 * client is a 42501, not a payload.
 */

let cached: { url: string; key: string } | null = null;

/**
 * Supabase URL + anon key. `scripts/run-e2e.sh` exports both (the seeder
 * prints them); a hand-run spec falls back to `.env.local` at the repo root.
 * The fallback assumes the target deploy talks to the same project .env.local
 * points at — true for staging, which runs on DEV Supabase.
 */
function supabaseEnv(): { url: string; key: string } {
  if (cached) return cached;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const envPath = join(__dirname, '..', '..', '.env.local');
    const parsed = Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '').trim()])
    );
    url = url || parsed.NEXT_PUBLIC_SUPABASE_URL;
    key = key || parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set and .env.local has neither — ' +
        'run through scripts/run-e2e.sh, or eval the seeder export block first.'
    );
  }
  cached = { url: url.replace(/\/$/, ''), key };
  return cached;
}

async function rest<T>(request: APIRequestContext, path: string): Promise<T[]> {
  const { url, key } = supabaseEnv();
  const res = await request.get(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok()) {
    throw new Error(`Supabase REST ${path} → ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? (body as T[]) : [];
}

export type LiveArtist = {
  id: string;
  slug: string;
  display_name: string | null;
  stripe_onboarded: boolean | null;
};

export type AvailableListing = {
  id: string;
  title: string;
  artist_id: string;
  price_visible: boolean | null;
};

/** Live artists, newest first — the old `GET /api/artists` payload's useful half. */
export function fetchLiveArtists(request: APIRequestContext, limit = 1000) {
  return rest<LiveArtist>(
    request,
    `artist_profiles?select=id,slug,display_name,stripe_onboarded&is_live=eq.true&order=created_at.desc&limit=${limit}`
  );
}

/** Available listings, newest first — the old `GET /api/listings` payload's useful half. */
export function fetchAvailableListings(request: APIRequestContext, limit = 1000) {
  return rest<AvailableListing>(
    request,
    `listings?select=id,title,artist_id,price_visible&status=eq.available&order=created_at.desc&limit=${limit}`
  );
}
