import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('artist_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', params.slug)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('profile_id')
    .eq('slug', params.slug)
    .single();

  if (!artist || artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('artist_profiles')
    .update(body)
    .eq('slug', params.slug)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
