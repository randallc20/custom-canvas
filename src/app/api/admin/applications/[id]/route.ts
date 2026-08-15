import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendArtistApprovedEmail, sendArtistRejectedEmail } from '@/services/email';

// Admin decision on an artist application. Approving flips the artist live;
// rejecting records a reason the artist sees and can fix before resubmitting.
// params.id is the artist_profiles id.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, reason } = (await request.json()) as {
    action: 'approve' | 'reject';
    reason?: string;
  };
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'reject' && !reason?.trim()) {
    return NextResponse.json({ error: 'A reason is required to reject.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, profile_id, display_name, application_status, profile:profiles(email, full_name)')
    .eq('id', params.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();

  if (action === 'approve') {
    await admin
      .from('artist_profiles')
      .update({
        application_status: 'approved',
        is_live: true,
        reviewed_by: user.id,
        reviewed_at: now,
        rejection_reason: null,
      })
      .eq('id', artist.id);

    await admin.from('notifications').insert({
      user_id: artist.profile_id,
      type: 'artist_approved',
      title: 'You\'re approved — your shop is live',
      body: 'Welcome to Custom Canvas. Your profile and listings are now visible to buyers.',
      link: '/studio',
    });
  } else {
    await admin
      .from('artist_profiles')
      .update({
        application_status: 'rejected',
        is_live: false,
        reviewed_by: user.id,
        reviewed_at: now,
        rejection_reason: reason!.trim(),
      })
      .eq('id', artist.id);

    await admin.from('notifications').insert({
      user_id: artist.profile_id,
      type: 'artist_rejected',
      title: 'Your application needs changes',
      body: reason!.trim(),
      link: '/studio',
    });
  }

  // Email is best-effort — never fail the admin action on a mail hiccup.
  const profile = artist.profile as unknown as { email: string | null; full_name: string | null } | null;
  if (profile?.email) {
    try {
      const name = profile.full_name ?? artist.display_name ?? 'there';
      if (action === 'approve') await sendArtistApprovedEmail(profile.email, name);
      else await sendArtistRejectedEmail(profile.email, name, reason!.trim());
    } catch {
      /* logged upstream via Sentry in the mailer */
    }
  }

  return NextResponse.json({ ok: true });
}
