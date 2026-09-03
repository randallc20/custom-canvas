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
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Action must be "approve" or "reject".' }, { status: 400 });
  }
  const admin = createAdminSupabaseClient();

  const { data: req } = await admin
    .from('verification_requests')
    .select('id, artist_id, status')
    .eq('id', params.id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Compare-and-swap on the pending state: without it, an approve landing
  // after a reject (two admins, or a double-click on a stale queue) re-flips
  // the badge on an artist who was already turned down.
  const { data: updated, error: updateError } = await admin.from('verification_requests')
    .update({ status: action === 'approve' ? 'approved' : 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 });
  }

  if (action === 'approve') {
    await admin.from('artist_profiles').update({ is_houston_verified: true }).eq('id', req.artist_id);
    const { data: artist } = await admin.from('artist_profiles').select('profile_id').eq('id', req.artist_id).single();
    if (artist?.profile_id) {
      await admin.from('notifications').insert({
        user_id: artist.profile_id,
        type: 'houston_verified',
        title: 'You\'re Local Verified',
        body: 'Your Local Verified badge is now live on your profile.',
        // /dashboard is the PARTNER home; an artist's home is the Studio.
        link: '/studio',
      });
    }
  }

  return NextResponse.json({ ok: true });
}
