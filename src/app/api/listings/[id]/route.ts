import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*))')
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Listing not found' }, { status: 404 });

  return NextResponse.json({
    ...data,
    tags: (data.tags as Array<{ tag: unknown }>)?.map((lt) => lt.tag) ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: listing } = await supabase
    .from('listings')
    .select('artist_id, artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();

  if (!listing || (listing.artist as unknown as { profile_id: string }).profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  // Allowlist editable columns — block artist_id reassignment and counters.
  const EDITABLE = [
    'title', 'description', 'medium', 'width_cm', 'height_cm', 'depth_cm',
    'year_created', 'price_cents', 'shipping_rate_cents', 'price_visible',
    'sold_price_cents', 'show_sold_price', 'series_id', 'status',
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in body) updates[key] = body[key];

  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: listing } = await supabase
    .from('listings')
    .select('artist:artist_profiles(profile_id)')
    .eq('id', params.id)
    .single();

  if (!listing || (listing.artist as unknown as { profile_id: string }).profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase.from('listings').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
