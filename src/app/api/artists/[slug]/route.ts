import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARTIST_PROFILE_EMBED } from '@/lib/publicProfile';

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('artist_profiles')
    .select(`*, ${ARTIST_PROFILE_EMBED}`)
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

  // Allowlist editable columns — never trust the body to set trust/ranking
  // fields (is_houston_verified, is_featured, completeness_score, stripe_*).
  const EDITABLE = [
    'display_name', 'bio', 'artist_statement', 'story', 'primary_mediums',
    'influences', 'school', 'graduation_year', 'status', 'neighborhood', 'city',
    'website_url', 'fulfillment_pref', 'commissions_open', 'commission_desc',
    'commission_min_cents', 'commission_turnaround', 'accent_color', 'bio_layout',
    'banner_image_url',
  ] as const;
  const updates: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in body) updates[key] = body[key];

  const { data, error } = await supabase
    .from('artist_profiles')
    .update(updates)
    .eq('slug', params.slug)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
