import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Self-service account deletion. The old client-side
// `profiles.delete()` was a silent zero-row no-op (profiles has no DELETE
// policy, deliberately) and never touched auth.users — the account looked
// deleted because the page signed out, but logging back in worked fine.
// Deleting the auth user cascades through profiles → artist/gallery rows →
// listings → images (ON DELETE CASCADE chain from 00001).
export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role === 'admin') {
    // An admin deleting themselves could orphan the whole admin panel.
    return NextResponse.json(
      { error: 'Admin accounts can’t self-delete — demote the account first.' },
      { status: 403 }
    );
  }

  const { error } = await createAdminSupabaseClient().auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
