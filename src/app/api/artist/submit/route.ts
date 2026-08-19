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
    .select('id, application_status, story')
    .eq('profile_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 404 });

  // Server-side essentials — the checklist gates the button client-side, but
  // the product rule (photo + story + a listing before review) must hold for
  // direct POSTs too, and it keeps empty shops out of the admin queue.
  const [{ data: prof }, { count: listingCount }] = await Promise.all([
    admin.from('profiles').select('avatar_url').eq('id', user.id).single(),
    admin.from('listings').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id),
  ]);
  if (!prof?.avatar_url || (artist.story?.trim().length ?? 0) < 100 || (listingCount ?? 0) === 0) {
    return NextResponse.json(
      { error: 'Add a profile photo, a story (100+ characters), and at least one listing before submitting.' },
      { status: 400 }
    );
  }

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
