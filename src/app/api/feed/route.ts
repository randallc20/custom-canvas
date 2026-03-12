import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const cursor = searchParams.get('cursor') ?? undefined;
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);
  const medium = searchParams.get('medium') ?? undefined;
  const minPrice = searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!, 10) : undefined;
  const maxPrice = searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!, 10) : undefined;
  const search = searchParams.get('search') ?? undefined;
  const sort = searchParams.get('sort') ?? 'recent';

  const supabase = createServerSupabaseClient();

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
    case 'price_asc': query = query.order('price_cents', { ascending: true }); break;
    case 'price_desc': query = query.order('price_cents', { ascending: false }); break;
    case 'popular': query = query.order('save_count', { ascending: false }); break;
    default: query = query.order('created_at', { ascending: false });
  }

  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMore = (data?.length ?? 0) > limit;
  const listings = (hasMore ? data!.slice(0, limit) : data ?? []).map((item) => ({
    ...item,
    tags: (item.tags as Array<{ tag: unknown }>)?.map((lt) => lt.tag) ?? [],
  }));

  const nextCursor = hasMore ? listings[listings.length - 1].created_at : null;

  return NextResponse.json({ listings, nextCursor });
}
