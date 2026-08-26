import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { PUBLIC_PROFILE_COLS } from '@/lib/publicProfile';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const pending = request.nextUrl.searchParams.get('pending') === 'true';

  // The admin verification queue needs applicant emails; email is not
  // client-readable (00031), so admins get a service-role read. Everyone
  // else gets the public profile columns.
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    isAdmin = me?.role === 'admin';
  }

  const client = isAdmin ? createAdminSupabaseClient() : supabase;
  const profileCols = isAdmin ? `${PUBLIC_PROFILE_COLS}, email` : PUBLIC_PROFILE_COLS;

  // gallery_profiles has TWO FKs to profiles (profile_id + verified_by), so an
  // unhinted profiles(...) embed is ambiguous (PGRST201) and 500s — the same
  // trap ARTIST_PROFILE_EMBED documents for artist_profiles.
  let query = client
    .from('gallery_profiles')
    .select(`*, profile:profiles!gallery_profiles_profile_id_fkey(${profileCols})`);

  if (pending) query = query.eq('is_verified', false);
  if (request.nextUrl.searchParams.get('verified') === 'true') query = query.eq('is_verified', true);

  // Pending queue reads oldest-first (review order); everything else newest-first.
  const { data, error } = await query.order('created_at', { ascending: pending });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { galleryId, action } = await request.json();

  if (action === 'verify') {
    const { data, error } = await supabase
      .from('gallery_profiles')
      .update({ is_verified: true, verified_at: new Date().toISOString(), verified_by: user.id })
      .eq('id', galleryId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Link education entries naming this newly verified partner.
    const { error: linkError } = await supabase.rpc('link_education_partners');
    if (linkError) console.error('education link failed after verify:', linkError.message);
    return NextResponse.json(data);
  }

  if (action === 'reject') {
    const { error } = await supabase.from('gallery_profiles').delete().eq('id', galleryId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
