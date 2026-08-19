import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendArtistApprovedEmail, sendArtistRejectedEmail } from '@/services/email';

// Admin decision on an artist application. Approving flips the artist live;
// rejecting records a reason the artist sees and can fix before resubmitting.
// The update is a compare-and-swap on application_status='pending': two
// admins acting at once (or approve-after-reject) resolve to one winner and
// a 409 — and no notification/email fires unless the state change actually
// happened. params.id is the artist_profiles id.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { action?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { action, reason } = body;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  if (action === 'reject' && !reason?.trim()) {
    return NextResponse.json({ error: 'A reason is required to reject.' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, profile_id, display_name, profile:profiles!artist_profiles_profile_id_fkey(email, full_name)')
    .eq('id', params.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const patch =
    action === 'approve'
      ? { application_status: 'approved', is_live: true, reviewed_by: user.id, reviewed_at: now, rejection_reason: null }
      : { application_status: 'rejected', is_live: false, reviewed_by: user.id, reviewed_at: now, rejection_reason: reason!.trim() };

  const { data: updated, error: updateError } = await admin
    .from('artist_profiles')
    .update(patch)
    .eq('id', artist.id)
    .eq('application_status', 'pending')
    .select('id');

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json(
      { error: 'This application was already decided (or withdrawn).' },
      { status: 409 }
    );
  }

  // Side effects only after the CAS succeeded.
  const { error: notifError } = await admin.from('notifications').insert(
    action === 'approve'
      ? {
          user_id: artist.profile_id,
          type: 'artist_approved',
          title: 'You\'re approved — your shop is live',
          body: 'Welcome to Custom Canvas. Your profile and listings are now visible to buyers.',
          link: '/studio',
        }
      : {
          user_id: artist.profile_id,
          type: 'artist_rejected',
          title: 'Your application needs changes',
          body: reason!.trim(),
          link: '/studio',
        }
  );
  if (notifError) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureMessage(`Application ${action} notification failed: ${notifError.message}`, 'warning');
  }

  // Email is best-effort — never fail the admin action on a mail hiccup.
  const profile = artist.profile as unknown as { email: string | null; full_name: string | null } | null;
  if (profile?.email) {
    const name = profile.full_name ?? artist.display_name ?? 'there';
    const send =
      action === 'approve'
        ? sendArtistApprovedEmail(profile.email, name)
        : sendArtistRejectedEmail(profile.email, name, reason!.trim());
    await send.catch(async (err) => {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Application ${action} email failed: ${err?.message ?? err}`, 'warning');
    });
  }

  return NextResponse.json({ ok: true });
}
