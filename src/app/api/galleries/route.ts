import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const pending = request.nextUrl.searchParams.get('pending') === 'true';

  let query = supabase.from('gallery_profiles').select('*, profile:profiles(*)');

  if (pending) query = query.eq('is_verified', false);

  const { data, error } = await query.order('created_at', { ascending: false });
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
    await supabase.rpc('link_education_partners');
    return NextResponse.json(data);
  }

  if (action === 'reject') {
    const { error } = await supabase.from('gallery_profiles').delete().eq('id', galleryId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
