import { supabase } from '@/lib/supabase';
import type { AnalyticsEventType, ArtistAnalytics } from '@/types/analytics';

export async function trackEvent(params: {
  artistId: string;
  eventType: AnalyticsEventType;
  listingId?: string;
  viewerId?: string;
}): Promise<void> {
  const { error } = await supabase.from('analytics_events').insert({
    artist_id: params.artistId,
    event_type: params.eventType,
    listing_id: params.listingId ?? null,
    viewer_id: params.viewerId ?? null,
  });

  if (error) throw error;
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
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('artist_id', artistId),
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
    total_followers: followersRes.count ?? 0,
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
