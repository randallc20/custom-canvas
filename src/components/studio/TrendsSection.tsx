'use client';

import { useArtistAnalytics } from '@/hooks/useAnalytics';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/utils/formatPrice';
import { useArtistProfileId } from '@/hooks/useArtistProfileId';

export function TrendsSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { artistId, loading } = useArtistProfileId();
  const { data: analytics, isLoading } = useArtistAnalytics(artistId);

  if (loading || isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  if (!analytics) return null;

  return (
    <div>
      {!embedded && <h2 className="mb-6 text-xl font-bold text-ink">Trends — last 30 days</h2>}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Profile Views" value={analytics.total_views.toLocaleString()} />
        <StatCard label="Saves" value={analytics.total_saves.toLocaleString()} />
        <StatCard label="Followers" value={analytics.total_followers.toLocaleString()} />
        <StatCard label="Orders" value={analytics.total_orders.toLocaleString()} />
        <StatCard label="Earnings" value={formatPrice(analytics.total_earnings_cents)} highlight />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink">Views — Last 30 Days</h2>
          {analytics.views_over_time.length > 0 ? (
            <SimpleBarChart
              data={analytics.views_over_time.map((d) => ({ label: formatDateShort(d.date), value: d.count }))}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted">No view data yet. Views will be tracked as collectors visit your profile and listings.</p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-sm font-semibold text-ink">Earnings — Last 30 Days</h2>
          {analytics.earnings_over_time.length > 0 ? (
            <SimpleBarChart
              data={analytics.earnings_over_time.map((d) => ({ label: formatDateShort(d.date), value: d.amount_cents / 100 }))}
              prefix="$"
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted">No earnings data yet. Your sales will appear here once orders come in.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-terraText' : 'text-ink'}`}>
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
          <span className="w-12 flex-shrink-0 text-xs text-muted">{d.label}</span>
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
          <span className="w-16 flex-shrink-0 text-right text-xs font-medium text-muted">
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
