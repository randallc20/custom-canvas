import { supabase } from '@/lib/supabase';
import { cityMatchPattern } from '@/lib/location';
import { ListingWithImages } from '@/types/listing';
import type { ArtistProfile } from '@/types/artist';

export type FeedSort = 'recent' | 'price_asc' | 'price_desc' | 'popular';

/** Forgiving retry query: every term prefix-matched, ANY term may match —
 *  so "abstract art" still finds "Gulf Abstract" and "print" finds
 *  "Printmaking". Used only when the strict websearch finds nothing. */
export function prefixOrQuery(search: string): string | null {
  const terms = search.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return null;
  return terms.map((t) => `${t}:*`).join(' | ');
}
export type Availability = 'available' | 'commission';

export interface FeedParams {
  page?: number;
  limit?: number;
  /** Scope to a community: matches artist_profiles.city (case-insensitive). */
  city?: string;
  medium?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: FeedSort;
  neighborhoods?: string[];
  schools?: string[];
  commissionsOpen?: boolean;
  availability?: Availability;
}

interface FeedResult {
  listings: ListingWithImages[];
  nextPage: number | null;
}

export async function getFeedListings(params: FeedParams = {}): Promise<FeedResult> {
  // Strict full-text first; if a search finds nothing, retry with a
  // forgiving any-term prefix query so extra words never zero the results.
  const strict = await runFeedQuery(params, 'strict');
  if (params.search && strict.listings.length === 0 && strict.nextPage === null) {
    return runFeedQuery(params, 'fallback');
  }
  return strict;
}

async function runFeedQuery(params: FeedParams, searchMode: 'strict' | 'fallback'): Promise<FeedResult> {
  const {
    page = 0, limit = 20, city, medium, minPrice, maxPrice, search, sort = 'recent',
    neighborhoods, schools, commissionsOpen, availability = 'available',
  } = params;

  // Inner-join artist_profiles so artist-attribute filters apply and we can
  // surface the artist on each card.
  let query = supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*)), artist:artist_profiles!inner(slug, display_name, neighborhood, school, commissions_open)');

  // Availability: "Commission Only" shows pieces from artists open to
  // commissions; default shows available-for-purchase work.
  if (availability === 'commission') {
    // Commission-only: active work from artists open to commissions — never
    // sold/hidden pieces.
    query = query.eq('artist_profiles.commissions_open', true).in('status', ['available', 'commission_only']);
  } else {
    query = query.eq('status', 'available');
  }

  if (city) query = query.ilike('artist_profiles.city', cityMatchPattern(city));
  if (medium) query = query.eq('medium', medium);
  if (minPrice !== undefined) query = query.gte('price_cents', minPrice);
  if (maxPrice !== undefined) query = query.lte('price_cents', maxPrice);
  if (search) {
    const fallback = searchMode === 'fallback' ? prefixOrQuery(search) : null;
    query = fallback
      ? query.textSearch('search_vector', fallback, { config: 'english' })
      : query.textSearch('search_vector', search, { type: 'websearch', config: 'english' });
  }
  if (neighborhoods?.length) query = query.in('artist_profiles.neighborhood', neighborhoods);
  if (schools?.length) query = query.in('artist_profiles.school', schools);
  if (commissionsOpen) query = query.eq('artist_profiles.commissions_open', true);

  // Stable ordering across arbitrary sorts: the sort column plus a unique
  // tiebreaker (id) so offset paging never skips/dupes on ties.
  switch (sort) {
    case 'price_asc': query = query.order('price_cents', { ascending: true }); break;
    case 'price_desc': query = query.order('price_cents', { ascending: false }); break;
    case 'popular': query = query.order('save_count', { ascending: false }); break;
    default: query = query.order('created_at', { ascending: false });
  }
  query = query.order('id', { ascending: false });

  // Offset paging works for every sort column (price/save_count aren't unique,
  // so keyset cursors can't).
  const from = page * limit;
  query = query.range(from, from + limit);

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const listings = (hasMore ? data.slice(0, limit) : data).map((item) => ({
    ...item,
    tags: item.tags?.map((lt: { tag: unknown }) => lt.tag) ?? [],
  })) as unknown as ListingWithImages[];

  return { listings, nextPage: hasMore ? page + 1 : null };
}

export interface ArtistsResult {
  artists: (ArtistProfile & { avatar_url: string | null })[];
  nextPage: number | null;
}

export async function getFeedArtists(params: { page?: number; limit?: number; search?: string; city?: string } = {}): Promise<ArtistsResult> {
  const strict = await runArtistsQuery(params, 'strict');
  if (params.search && strict.artists.length === 0 && strict.nextPage === null) {
    return runArtistsQuery(params, 'fallback');
  }
  return strict;
}

async function runArtistsQuery(params: { page?: number; limit?: number; search?: string; city?: string }, searchMode: 'strict' | 'fallback'): Promise<ArtistsResult> {
  const { page = 0, limit = 24, search, city } = params;

  let query = supabase
    .from('artist_profiles')
    .select('*, profile:profiles!artist_profiles_profile_id_fkey(avatar_url)')
    .eq('is_live', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (search) {
    const fallback = searchMode === 'fallback' ? prefixOrQuery(search) : null;
    query = fallback
      ? query.textSearch('search_vector', fallback, { config: 'english' })
      : query.textSearch('search_vector', search, { type: 'websearch', config: 'english' });
  }
  if (city) query = query.ilike('city', cityMatchPattern(city));

  const from = page * limit;
  query = query.range(from, from + limit);

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const rows = hasMore ? data.slice(0, limit) : data;
  const artists = rows.map((a: Record<string, unknown>) => ({
    ...(a as unknown as ArtistProfile),
    avatar_url: (a.profile as { avatar_url: string | null } | null)?.avatar_url ?? null,
  }));

  return { artists, nextPage: hasMore ? page + 1 : null };
}

export interface SearchSuggestions {
  artists: { slug: string; display_name: string }[];
  listings: { id: string; title: string }[];
}

export async function getSearchSuggestions(term: string): Promise<SearchSuggestions> {
  if (!term.trim()) return { artists: [], listings: [] };
  const run = async (mode: 'strict' | 'fallback') => {
    const fallback = mode === 'fallback' ? prefixOrQuery(term) : null;
    const searchArg = fallback ?? term;
    const searchOpts = fallback
      ? { config: 'english' }
      : { type: 'websearch' as const, config: 'english' };
    const [artistsRes, listingsRes] = await Promise.all([
      supabase.from('artist_profiles').select('slug, display_name').eq('is_live', true)
        .textSearch('search_vector', searchArg, searchOpts).limit(3),
      supabase.from('listings').select('id, title').eq('status', 'available')
        .textSearch('search_vector', searchArg, searchOpts).limit(3),
    ]);
    return { artists: artistsRes.data ?? [], listings: listingsRes.data ?? [] };
  };
  const strict = await run('strict');
  if (strict.artists.length || strict.listings.length) return strict;
  return run('fallback');
}

/** Distinct neighborhood/school values for the filter multi-selects,
 *  scoped to the buyer's community when one is set. */
export async function getFilterOptions(city?: string): Promise<{ neighborhoods: string[]; schools: string[] }> {
  let query = supabase
    .from('artist_profiles')
    .select('neighborhood, school');
  if (city) query = query.ilike('city', cityMatchPattern(city));
  const { data } = await query;
  const neighborhoods = new Set<string>();
  const schools = new Set<string>();
  for (const row of data ?? []) {
    if (row.neighborhood) neighborhoods.add(row.neighborhood);
    if (row.school) schools.add(row.school);
  }
  return {
    neighborhoods: Array.from(neighborhoods).sort(),
    schools: Array.from(schools).sort(),
  };
}
