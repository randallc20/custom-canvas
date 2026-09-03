'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';

interface PlatformStats {
  total_users: number;
  total_artists: number;
  active_listings: number;
  total_orders: number;
  total_revenue_cents: number;
  platform_fees_cents: number;
  pending_reports: number;
  pending_applications: number;
  users_over_time: { date: string; count: number }[];
  revenue_over_time: { date: string; amount_cents: number }[];
}

interface RecentOrder {
  id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  buyer: { full_name: string | null } | null;
}

interface RecentUser {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

const NAV_LINKS = [
  { href: '/admin/featured', label: 'Featured', desc: 'Curate the homepage shelf' },
  { href: '/admin/users', label: 'Users', desc: 'Manage accounts' },
  { href: '/admin/galleries', label: 'Galleries', desc: 'Verify galleries' },
  { href: '/admin/listings', label: 'Listings', desc: 'Review content' },
  { href: '/admin/orders', label: 'Orders', desc: 'Track transactions' },
  { href: '/admin/disputes', label: 'Disputes', desc: 'Resolve reports' },
  { href: '/admin/commissions', label: 'Commissions', desc: 'Resolve disputed commissions' },
  { href: '/admin/verifications', label: 'Verifications', desc: 'Local Verified queue' },
  { href: '/admin/applications', label: 'Applications', desc: 'Approve new artists' },
  { href: '/admin/services', label: 'Services', desc: 'Curate artist services' },
];

export default function AdminPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <AdminDashboard />
      </AuthGuard>
    </PageShell>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetch('/api/admin/stats').then((r) => r.json()),
      supabase
        .from('orders')
        .select('id, amount_cents, status, created_at, buyer:profiles!orders_buyer_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(({ data }) => data ?? []),
      // Emails aren't client-readable (00031) — go through the admin API.
      fetch('/api/admin/users?limit=5').then((r) => (r.ok ? r.json() : [])),
    ]).then(([statsData, ordersData, usersData]) => {
      setStats(statsData);
      setRecentOrders(ordersData as unknown as RecentOrder[]);
      setRecentUsers(usersData as unknown as RecentUser[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!stats) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Admin Dashboard</h1>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={stats.total_users.toLocaleString()} />
        <StatCard label="Artists" value={stats.total_artists.toLocaleString()} />
        <StatCard label="Active Listings" value={stats.active_listings.toLocaleString()} />
        <StatCard label="Total Orders" value={stats.total_orders.toLocaleString()} />
      </div>

      {stats.pending_applications > 0 && (
        <div className="mb-8">
          <Link href="/admin/applications">
            <div className="rounded-lg border border-terra/40 bg-terraSoft/60 p-4">
              <p className="text-sm text-terraText">Artist applications awaiting review</p>
              <p className="text-2xl font-bold text-ink">{stats.pending_applications}</p>
            </div>
          </Link>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Revenue" value={formatPrice(stats.total_revenue_cents)} highlight />
        <StatCard label="Platform Revenue (15%)" value={formatPrice(stats.platform_fees_cents)} highlight />
        {stats.pending_reports > 0 ? (
          <Link href="/admin/disputes">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-600">Pending Reports</p>
              <p className="text-2xl font-bold text-red-700">{stats.pending_reports}</p>
            </div>
          </Link>
        ) : (
          <StatCard label="Pending Reports" value="0" />
        )}
      </div>

      {/* Charts */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">New Users — Last 30 Days</h2>
          {stats.users_over_time.length > 0 ? (
            <MiniBarChart data={stats.users_over_time.map((d) => ({ label: shortDate(d.date), value: d.count }))} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">No signups in this period.</p>
          )}
        </div>
        <div className="rounded-lg border border-line p-6">
          <h2 className="mb-4 text-sm font-semibold text-ink">Platform Revenue — Last 30 Days</h2>
          {stats.revenue_over_time.length > 0 ? (
            <MiniBarChart data={stats.revenue_over_time.map((d) => ({ label: shortDate(d.date), value: d.amount_cents / 100 }))} prefix="$" />
          ) : (
            <p className="py-6 text-center text-sm text-muted">No revenue in this period.</p>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Orders</h2>
            <Link href="/admin/orders" className="text-xs text-terraText hover:underline">View all</Link>
          </div>
          {recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-xs text-muted">#{o.id.slice(0, 8)}</span>
                    <span className="ml-2 text-ink">{o.buyer?.full_name ?? 'Unknown'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatPrice(o.amount_cents)}</span>
                    <Badge variant={o.status === 'paid' ? 'success' : 'default'}>{o.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">No orders yet.</p>
          )}
        </div>

        <div className="rounded-lg border border-line p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Recent Signups</h2>
            <Link href="/admin/users" className="text-xs text-terraText hover:underline">View all</Link>
          </div>
          {recentUsers.length > 0 ? (
            <div className="space-y-3">
              {recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{u.full_name ?? u.email}</span>
                  <Badge>{u.role}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">No users yet.</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-lg border border-line p-5 transition-colors hover:border-line hover:bg-sand/50">
            <h3 className="font-medium text-ink">{link.label}</h3>
            <p className="mt-1 text-sm text-muted">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-terraText' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function MiniBarChart({ data, prefix = '' }: { data: { label: string; value: number }[]; prefix?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-10 flex-shrink-0 text-[10px] text-muted">{d.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-sand">
            <div className="h-full rounded bg-terra" style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }} />
          </div>
          <span className="w-14 flex-shrink-0 text-right text-xs text-muted">{prefix}{d.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
