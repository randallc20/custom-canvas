'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useArtistAnalytics } from '@/hooks/useAnalytics';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  const { data: analytics, isLoading } = useArtistAnalytics(artistId);

  if (isLoading || !artistId) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  if (!analytics) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">Back to Dashboard</Button>
        </Link>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Profile Views" value={analytics.total_views.toLocaleString()} />
        <StatCard label="Saves" value={analytics.total_saves.toLocaleString()} />
        <StatCard label="Followers" value={analytics.total_followers.toLocaleString()} />
        <StatCard label="Orders" value={analytics.total_orders.toLocaleString()} />
        <StatCard label="Earnings" value={formatPrice(analytics.total_earnings_cents)} highlight />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Views — Last 30 Days</h2>
          {analytics.views_over_time.length > 0 ? (
            <SimpleBarChart
              data={analytics.views_over_time.map((d) => ({ label: formatDateShort(d.date), value: d.count }))}
            />
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No view data yet. Views will be tracked as collectors visit your profile and listings.</p>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Earnings — Last 30 Days</h2>
          {analytics.earnings_over_time.length > 0 ? (
            <SimpleBarChart
              data={analytics.earnings_over_time.map((d) => ({ label: formatDateShort(d.date), value: d.amount_cents / 100 }))}
              prefix="$"
            />
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No earnings data yet. Your sales will appear here once orders come in.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-terra' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

function SimpleBarChart({ data, prefix = '' }: { data: { label: string; value: number }[]; prefix?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-12 flex-shrink-0 text-xs text-gray-400">{d.label}</span>
          <div className="flex-1">
            <div
              className="h-5 rounded bg-terra/20"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
            >
              <div
                className="h-full rounded bg-terra"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <span className="w-16 flex-shrink-0 text-right text-xs font-medium text-gray-600">
            {prefix}{d.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
