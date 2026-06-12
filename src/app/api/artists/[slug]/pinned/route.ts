import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const pinnedSchema = z.object({
  pinned_listing_ids: z.array(z.string().uuid()).max(3, 'You can pin up to 3 works'),
});

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = pinnedSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, profile_id')
    .eq('slug', params.slug)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  if (artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ids = parsed.data.pinned_listing_ids;
  if (ids.length > 0) {
    const { count } = await supabase
      .from('listings')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .in('id', ids);
    if ((count ?? 0) !== ids.length) {
      return NextResponse.json({ error: 'You can only pin your own listings' }, { status: 400 });
    }
  }

  const { error } = await supabase
    .from('artist_profiles')
    .update({ pinned_listing_ids: ids })
    .eq('id', artist.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
