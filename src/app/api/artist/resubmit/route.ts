import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// A rejected artist, after addressing the feedback, puts themselves back in the
// review queue. Routed through the service role because the approval columns are
// frozen for the artist's own writes (00030 guard) — the same pattern the
// commission actions use. Moving back to 'pending' re-notifies admins via the
// artist_application_notify trigger.
export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabaseClient();
  const { data: artist } = await admin
    .from('artist_profiles')
    .select('id, application_status')
    .eq('profile_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 404 });
  if (artist.application_status !== 'rejected') {
    return NextResponse.json({ error: 'Only a rejected application can be resubmitted.' }, { status: 409 });
  }

  await admin
    .from('artist_profiles')
    .update({
      application_status: 'pending',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', artist.id);

  return NextResponse.json({ ok: true });
}
