import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

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
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId),
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
    total_followers: followersRes.count ?? 0,
    total_earnings_cents: totalEarnings,
    total_orders: orders.length,
  });
}

const ALLOWED_EVENTS = ['profile_view', 'listing_view', 'listing_save'];

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json();
  const { artist_id, event_type, listing_id } = body;

  if (!artist_id || !event_type) {
    return NextResponse.json({ error: 'artist_id and event_type are required' }, { status: 400 });
  }
  if (!ALLOWED_EVENTS.includes(event_type)) {
    return NextResponse.json({ error: 'invalid event_type' }, { status: 400 });
  }

  // viewer_id is derived from the session, never the client — prevents
  // attributing a view to an arbitrary user (guests record as null).
  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase.from('analytics_events').insert({
    artist_id,
    event_type,
    listing_id: listing_id ?? null,
    viewer_id: user?.id ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true }, { status: 201 });
}
