import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { listingSchema } from '@/schemas/listingSchema';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*)')
    .eq('status', 'available')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('profile_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 403 });

  const { tags, ...listingData } = parsed.data;

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({ ...listingData, artist_id: artist.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (tags.length > 0) {
    const { data: existingTags } = await supabase
      .from('tags')
      .select('id, name')
      .in('name', tags);

    if (existingTags && existingTags.length > 0) {
      await supabase.from('listing_tags').insert(
        existingTags.map((tag) => ({ listing_id: listing.id, tag_id: tag.id }))
      );
    }
  }

  return NextResponse.json(listing, { status: 201 });
}
