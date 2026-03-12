import { supabase } from '@/lib/supabase';
import { ListingWithImages } from '@/types/listing';

interface FeedParams {
  cursor?: string;
  limit?: number;
  medium?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
}

interface FeedResult {
  listings: ListingWithImages[];
  nextCursor: string | null;
}

export async function getFeedListings(params: FeedParams = {}): Promise<FeedResult> {
  const { cursor, limit = 20, medium, minPrice, maxPrice, search, sort = 'recent' } = params;

  let query = supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
    .eq('status', 'available');

  if (medium) query = query.eq('medium', medium);
  if (minPrice !== undefined) query = query.gte('price_cents', minPrice);
  if (maxPrice !== undefined) query = query.lte('price_cents', maxPrice);
  if (search) query = query.textSearch('search_vector', search);
  if (cursor) query = query.lt('created_at', cursor);

  switch (sort) {
    case 'price_asc':
      query = query.order('price_cents', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price_cents', { ascending: false });
      break;
    case 'popular':
      query = query.order('save_count', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) throw error;

  const hasMore = data.length > limit;
  const listings = (hasMore ? data.slice(0, limit) : data).map((item) => ({
    ...item,
    tags: item.tags?.map((lt: { tag: unknown }) => lt.tag) ?? [],
  })) as ListingWithImages[];

  const nextCursor = hasMore ? listings[listings.length - 1].created_at : null;

  return { listings, nextCursor };
}
