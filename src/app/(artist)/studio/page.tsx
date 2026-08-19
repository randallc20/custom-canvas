'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useArtistListings } from '@/hooks/useArtist';
import { useArtistOrders } from '@/hooks/useOrders';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';
import { PinnedListingSelector } from '@/components/dashboard/PinnedListingSelector';
import { AwayModeToggle } from '@/components/dashboard/AwayModeToggle';
import { HoustonVerifiedCard } from '@/components/dashboard/HoustonVerifiedCard';
import { NeedsAttention } from '@/components/studio/NeedsAttention';
import { ReviewStatusBanner } from '@/components/studio/ReviewStatusBanner';
import { SetupChecklist } from '@/components/studio/SetupChecklist';
import { TrendsSection } from '@/components/studio/TrendsSection';
import type { Order } from '@/types/order';

export default function StudioHomePage() {
  const { artist, loading } = useOwnArtistProfile();
  const [showTrends, setShowTrends] = useState(false);
  const { data: listings } = useArtistListings(artist?.id ?? '');
  const { data: orders } = useArtistOrders(artist?.id ?? '');

  // /analytics redirects here with ?trends=open — land with the charts out.
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('trends') === 'open') {
      setShowTrends(true);
    }
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const listingCount = listings?.length ?? 0;
  const totalSales = orders?.filter((o) => o.status !== 'refunded').length ?? 0;
  const totalRevenue = orders?.filter((o) => o.status !== 'refunded').reduce((sum, o) => sum + o.artist_payout_cents, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink">Studio</h1>
        <Link href="/listings/new"><Button>New Listing</Button></Link>
      </div>

      {artist && artist.application_status === 'draft' && (
        <SetupChecklist artist={artist} listings={listings} />
      )}
      {artist && <ReviewStatusBanner status={artist.application_status} />}

      {!artist?.stripe_onboarded && (
        <div className="mb-6 rounded-xl border border-terra/30 bg-terraSoft/60 p-4">
          <p className="text-sm text-ink">
            Set up your Stripe account to start accepting payments.{' '}
            <Link href="/studio/sales" className="font-medium text-terra underline">Connect now</Link>
          </p>
        </div>
      )}

      {artist && <NeedsAttention artistId={artist.id} />}

      {artist && <WeekStrip artistId={artist.id} orders={orders} />}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Profile Completeness" value={`${artist?.completeness_score ?? 0}%`} />
        <StatCard label="Listings" value={String(listingCount)} />
        <StatCard label="Total Sales" value={String(totalSales)} />
        <StatCard label="Revenue" value={formatPrice(totalRevenue)} />
      </div>

      {artist && (
        <div className="mb-8">
          <PinnedListingSelector
            artistId={artist.id}
            artistSlug={artist.slug}
            initialPinnedIds={artist.pinned_listing_ids ?? []}
          />
        </div>
      )}

      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <HoustonVerifiedCard />
        <AwayModeToggle />
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <button
          onClick={() => setShowTrends((s) => !s)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-sm font-semibold text-ink">Trends — last 30 days</span>
          <span className="text-muted">{showTrends ? '▾' : '▸'}</span>
        </button>
        {showTrends && (
          <div className="mt-4">
            <TrendsSection embedded />
          </div>
        )}
      </div>
    </div>
  );
}

/** "How did this week go?" — 7-day pulse: views, saves, orders, earnings. */
function WeekStrip({ artistId, orders }: { artistId: string; orders: Order[] | undefined }) {
  const [counts, setCounts] = useState<{ views: number; saves: number } | null>(null);

  useEffect(() => {
    if (!artistId) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .in('event_type', ['listing_view', 'profile_view'])
        .gte('created_at', since),
      supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('event_type', 'listing_save')
        .gte('created_at', since),
    ]).then(([views, saves]) => setCounts({ views: views.count ?? 0, saves: saves.count ?? 0 }));
  }, [artistId]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekOrders = orders?.filter(
    (o) => o.status !== 'refunded' && new Date(o.created_at).getTime() >= weekAgo
  ) ?? [];
  const weekEarnings = weekOrders.reduce((sum, o) => sum + o.artist_payout_cents, 0);

  return (
    <div className="mb-8 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">Last 7 days:</span>{' '}
        {counts ? `${counts.views} views · ${counts.saves} saves` : '… ·'}{' '}
        · {weekOrders.length} order{weekOrders.length === 1 ? '' : 's'} · {formatPrice(weekEarnings)} earned
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
