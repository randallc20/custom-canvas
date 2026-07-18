import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action } = await request.json(); // 'approve' | 'reject'
  const admin = createAdminSupabaseClient();

  const { data: req } = await admin
    .from('verification_requests')
    .select('id, artist_id, status')
    .eq('id', params.id)
    .single();
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await admin.from('verification_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', params.id);

  if (action === 'approve') {
    await admin.from('artist_profiles').update({ is_houston_verified: true }).eq('id', req.artist_id);
    const { data: artist } = await admin.from('artist_profiles').select('profile_id').eq('id', req.artist_id).single();
    if (artist?.profile_id) {
      await admin.from('notifications').insert({
        user_id: artist.profile_id,
        type: 'houston_verified',
        title: 'You\'re Local Verified',
        body: 'Your Local Verified badge is now live on your profile.',
        link: '/dashboard',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
