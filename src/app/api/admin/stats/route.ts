import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const since = thirtyDaysAgo.toISOString();

  const [
    usersRes,
    artistsRes,
    listingsRes,
    ordersRes,
    revenueRes,
    reportsRes,
    newUsersRes,
    newOrdersRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('artist_profiles').select('*', { count: 'exact', head: true }),
    supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'available'),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('amount_cents, platform_fee_cents').in('status', ['paid', 'shipped', 'delivered']),
    supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('created_at').gte('created_at', since).order('created_at', { ascending: true }),
    supabase.from('orders').select('amount_cents, platform_fee_cents, created_at').gte('created_at', since).in('status', ['paid', 'shipped', 'delivered']).order('created_at', { ascending: true }),
  ]);

  const revenue = (revenueRes.data ?? []).reduce((sum, o) => sum + o.amount_cents, 0);
  const platformFees = (revenueRes.data ?? []).reduce((sum, o) => sum + o.platform_fee_cents, 0);

  const usersByDay = aggregateByDate((newUsersRes.data ?? []).map((u) => u.created_at));
  const revenueByDay = aggregateAmountByDate(
    (newOrdersRes.data ?? []).map((o) => ({ date: o.created_at, amount: o.platform_fee_cents }))
  );

  return NextResponse.json({
    total_users: usersRes.count ?? 0,
    total_artists: artistsRes.count ?? 0,
    active_listings: listingsRes.count ?? 0,
    total_orders: ordersRes.count ?? 0,
    total_revenue_cents: revenue,
    platform_fees_cents: platformFees,
    pending_reports: reportsRes.count ?? 0,
    users_over_time: usersByDay,
    revenue_over_time: revenueByDay,
  });
}

function aggregateByDate(timestamps: string[]): { date: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const ts of timestamps) {
    const date = ts.slice(0, 10);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

function aggregateAmountByDate(entries: { date: string; amount: number }[]): { date: string; amount_cents: number }[] {
  const totals: Record<string, number> = {};
  for (const e of entries) {
    const date = e.date.slice(0, 10);
    totals[date] = (totals[date] ?? 0) + e.amount;
  }
  return Object.entries(totals).map(([date, amount_cents]) => ({ date, amount_cents }));
}
