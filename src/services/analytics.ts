import { supabase } from '@/lib/supabase';
import type { AnalyticsEventType, ArtistAnalytics } from '@/types/analytics';

/** Records a view. Goes through /api/analytics (rate-limited per IP, inserts
 *  with the service role) instead of a direct anon-key insert into
 *  analytics_events, which no limiter ever saw (01-P2 / R7). viewer_id is
 *  taken from the server session, so it is deliberately not a parameter. */
export async function trackEvent(params: {
  artistId: string;
  eventType: AnalyticsEventType;
  listingId?: string;
}): Promise<void> {
  const res = await fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist_id: params.artistId,
      event_type: params.eventType,
      listing_id: params.listingId ?? null,
    }),
    // Let the ping outlive a navigation away from the page it counts.
    keepalive: true,
  });
  if (!res.ok) throw new Error(`analytics: ${res.status}`);
}

export async function getArtistAnalytics(artistId: string): Promise<ArtistAnalytics> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [viewsRes, savesRes, followersRes, ordersRes, recentViewsRes, recentOrdersRes] = await Promise.all([
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('event_type', 'profile_view'),
    supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('event_type', 'listing_save'),
    // follows is own-rows-only (00052); the artist reads their count via RPC.
    supabase.rpc('follower_count', { p_artist_id: artistId }),
    supabase
      .from('orders')
      .select('artist_payout_cents')
      .eq('artist_id', artistId)
      .in('status', ['paid', 'shipped', 'delivered']),
    supabase
      .from('analytics_events')
      .select('created_at')
      .eq('artist_id', artistId)
      .in('event_type', ['profile_view', 'listing_view'])
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    supabase
      .from('orders')
      .select('artist_payout_cents, created_at')
      .eq('artist_id', artistId)
      .in('status', ['paid', 'shipped', 'delivered'])
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
  ]);

  const orders = ordersRes.data ?? [];
  const totalEarnings = orders.reduce((sum, o) => sum + o.artist_payout_cents, 0);

  const viewsOverTime = aggregateByDate(
    (recentViewsRes.data ?? []).map((e) => e.created_at)
  );

  const earningsOverTime = aggregateEarningsByDate(
    (recentOrdersRes.data ?? []).map((o) => ({
      date: o.created_at,
      amount_cents: o.artist_payout_cents,
    }))
  );

  return {
    total_views: viewsRes.count ?? 0,
    total_saves: savesRes.count ?? 0,
    total_followers: Number(followersRes.data ?? 0),
    total_earnings_cents: totalEarnings,
    total_orders: orders.length,
    views_over_time: viewsOverTime,
    earnings_over_time: earningsOverTime,
  };
}

function aggregateByDate(timestamps: string[]): { date: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const ts of timestamps) {
    const date = ts.slice(0, 10);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

function aggregateEarningsByDate(
  entries: { date: string; amount_cents: number }[]
): { date: string; amount_cents: number }[] {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const date = e.date.slice(0, 10);
    totals[date] = (totals[date] ?? 0) + e.amount_cents;
  }
  return Object.entries(totals).map(([date, amount_cents]) => ({ date, amount_cents }));
}
