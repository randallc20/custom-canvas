import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = request.nextUrl.searchParams.get('artist_id');
  if (!artistId) return NextResponse.json({ error: 'artist_id is required' }, { status: 400 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('profile_id')
    .eq('id', artistId)
    .single();

  if (artist?.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [viewsRes, savesRes, followersRes, ordersRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('event_type', 'profile_view')
      .gte('created_at', since),
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('event_type', 'listing_save')
      .gte('created_at', since),
    // follows is own-rows-only (00052); the count comes from the RPC.
    supabase.rpc('follower_count', { p_artist_id: artistId }),
    supabase
      .from('orders')
      .select('artist_payout_cents')
      .eq('artist_id', artistId)
      .in('status', ['paid', 'shipped', 'delivered']),
  ]);

  const orders = ordersRes.data ?? [];
  const totalEarnings = orders.reduce((sum, o) => sum + o.artist_payout_cents, 0);

  return NextResponse.json({
    total_views: viewsRes.count ?? 0,
    total_saves: savesRes.count ?? 0,
    total_followers: Number(followersRes.data ?? 0),
    total_earnings_cents: totalEarnings,
    total_orders: orders.length,
  });
}

// The only events the browser may record. listing_share/follow exist in the
// type but nothing emits them; keep the server list tight.
const trackSchema = z.object({
  event_type: z.enum(['profile_view', 'listing_view', 'listing_save']),
  artist_id: z.string().uuid(),
  listing_id: z.string().uuid().nullish(),
});

/** The one write path for analytics_events (01-P2 / R7). The browser used
 *  to insert straight into the table with the anon key, which no rate
 *  limiter ever saw; now every view lands here (middleware: 60/min per IP)
 *  and is written with the service role. R8 drops the client INSERT policy. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid event', details: parsed.error.flatten() }, { status: 400 });
  }

  // viewer_id is derived from the session, never the client — prevents
  // attributing a view to an arbitrary user (guests record as null).
  const { data: { user } } = await createServerSupabaseClient().auth.getUser();

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('analytics_events').insert({
    artist_id: parsed.data.artist_id,
    event_type: parsed.data.event_type,
    listing_id: parsed.data.listing_id ?? null,
    viewer_id: user?.id ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}
