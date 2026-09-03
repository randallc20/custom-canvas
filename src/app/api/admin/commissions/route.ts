import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Admin commission queue. commissions has only a participants SELECT policy
// (00001), so an admin cannot read other people's commissions from the
// browser at all — this service-role route after a role check is the only
// way the queue can exist. Defaults to the disputed ones, which are the
// stuck ones (04-P2, ruling D5).
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = request.nextUrl.searchParams.get('status') ?? 'disputed';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') ?? '100', 10) || 100, 200);

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('commissions')
    .select(`
      id, title, description, status, budget_min_cents, budget_max_cents,
      quoted_price_cents, dispute_reason, pre_dispute_status, closed_by,
      closed_reason, conversation_id, created_at, updated_at,
      artist:artist_profiles!inner(display_name, slug),
      requester:profiles!commissions_requester_id_fkey(full_name)
    `)
    .eq('status', status)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
