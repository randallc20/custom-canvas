import { supabase } from '@/lib/supabase';
import { ListingWithImages } from '@/types/listing';
import { getFeedListings } from '@/services/feed';

export const FEATURED_SHELF_CAP = 10;

/** Public homepage shelf: curated listings that are still available, in
 *  curator order. Fails soft (empty) so the homepage never breaks on it. */
export async function getFeaturedShelf(): Promise<ListingWithImages[]> {
  const { data, error } = await supabase
    .from('featured_listings')
    .select('display_order, listing:listings!inner(*, images:listing_images(*), artist:artist_profiles(slug, display_name))')
    .eq('listings.status', 'available')
    .order('display_order', { ascending: true });
  if (error) return [];
  return (data ?? []).map((row) => row.listing) as unknown as ListingWithImages[];
}

export interface NeighborhoodSpotlight {
  neighborhood: string;
  listings: ListingWithImages[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SPOTLIGHT_MIN_LISTINGS = 3;

/** Computed shelf: one Houston neighborhood per week, rotating
 *  deterministically through every neighborhood that has enough live work.
 *  weekSeed is overridable for tests/dev. */
export async function getNeighborhoodSpotlight(
  weekSeed?: number
): Promise<NeighborhoodSpotlight | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('artist:artist_profiles!inner(neighborhood)')
    .eq('status', 'available');
  if (error) return null;

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const hood = (row.artist as unknown as { neighborhood: string | null })?.neighborhood;
    if (hood) counts.set(hood, (counts.get(hood) ?? 0) + 1);
  }
  const eligible = Array.from(counts.entries())
    .filter(([, count]) => count >= SPOTLIGHT_MIN_LISTINGS)
    .map(([hood]) => hood)
    .sort();
  if (!eligible.length) return null;

  const week = weekSeed ?? Math.floor(Date.now() / WEEK_MS);
  const neighborhood = eligible[week % eligible.length];

  const { listings } = await getFeedListings({ neighborhoods: [neighborhood], limit: 8 });
  return { neighborhood, listings };
}

// ---- Admin curation ----

export interface FeaturedRow {
  listing_id: string;
  display_order: number;
  featured_at: string;
  // Null when the listing is no longer visible to this admin session (e.g.
  // the artist hid it and the listings SELECT policy filters it out).
  listing: {
    id: string;
    title: string;
    price_cents: number;
    status: string;
    artist: { display_name: string } | null;
    images: { image_url: string; is_primary: boolean }[];
  } | null;
}

export async function getFeaturedAdmin(): Promise<FeaturedRow[]> {
  const { data, error } = await supabase
    .from('featured_listings')
    .select('listing_id, display_order, featured_at, listing:listings(id, title, price_cents, status, artist:artist_profiles(display_name), images:listing_images(image_url, is_primary))')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as FeaturedRow[];
}

export async function addFeatured(listingId: string, displayOrder: number): Promise<void> {
  const { error } = await supabase
    .from('featured_listings')
    .insert({ listing_id: listingId, display_order: displayOrder });
  if (error) throw error;
}

export async function removeFeatured(listingId: string): Promise<void> {
  const { error } = await supabase.from('featured_listings').delete().eq('listing_id', listingId);
  if (error) throw error;
}

export async function updateFeaturedOrder(listingId: string, displayOrder: number): Promise<void> {
  const { error } = await supabase
    .from('featured_listings')
    .update({ display_order: displayOrder })
    .eq('listing_id', listingId);
  if (error) throw error;
}

/** Search available listings to feature (excluding already-featured ids). */
export async function searchFeaturableListings(
  term: string,
  excludeIds: string[]
): Promise<{ id: string; title: string; price_cents: number; artist: { display_name: string } | null }[]> {
  let query = supabase
    .from('listings')
    .select('id, title, price_cents, artist:artist_profiles(display_name)')
    .eq('status', 'available')
    .ilike('title', `%${term}%`)
    .limit(8);
  if (excludeIds.length) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string; title: string; price_cents: number; artist: { display_name: string } | null;
  }[];
}
