import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// The artist puts their shop in the review queue (draft → pending), or back
// in after addressing rejection feedback (rejected → pending). Service role
// because the approval columns are frozen for the artist's own writes (00030
// guard). Compare-and-swap: the status filter on the UPDATE means a
// concurrent admin decision (or double-click) loses cleanly with a 409
// rather than clobbering state. The 00032 trigger notifies admins on the
// transition into 'pending'.
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

  const { data: updated, error } = await admin
    .from('artist_profiles')
    .update({
      application_status: 'pending',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq('id', artist.id)
    .in('application_status', ['draft', 'rejected'])
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated?.length) {
    return NextResponse.json(
      { error: 'Your shop is already in review or has been approved.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
