import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Admin user directory. Emails are no longer client-readable (00031 column
// privacy), so the admin pages fetch them through this service-role route
// instead of querying profiles from the browser.
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10) || 200, 500);

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, role, full_name, avatar_url, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
