import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// The artist's own review state. rejection_reason is not client-readable
// (00033 column privacy — it would otherwise be public), so the Studio
// banner fetches it here; the service role reads it after we verify the
// caller owns the profile.
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await createAdminSupabaseClient()
    .from('artist_profiles')
    .select('application_status, rejection_reason')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No artist profile' }, { status: 404 });
  return NextResponse.json(data);
}
