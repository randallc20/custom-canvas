'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useArtistListings } from '@/hooks/useArtist';
import { useArtistOrders } from '@/hooks/useOrders';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/utils/formatPrice';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function ArtistDashboard() {
  const { user } = useAuth();
  const [artist, setArtist] = useState<{ id: string; completeness_score: number; stripe_onboarded: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const { data: listings } = useArtistListings(artist?.id ?? '');
  const { data: orders } = useArtistOrders(artist?.id ?? '');

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, completeness_score, stripe_onboarded').eq('profile_id', user.id).single()
      .then(({ data }) => { setArtist(data); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const listingCount = listings?.length ?? 0;
  const totalSales = orders?.filter((o) => o.status !== 'refunded').length ?? 0;
  const totalRevenue = orders?.reduce((sum, o) => sum + o.artist_payout_cents, 0) ?? 0;
  const pendingShipment = orders?.filter((o) => o.status === 'paid').length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Artist Dashboard</h1>

      {!artist?.stripe_onboarded && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Set up your Stripe account to start accepting payments.{' '}
            <Link href="/payouts" className="font-medium underline">Connect now</Link>
          </p>
        </div>
      )}

      {pendingShipment > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">
            You have {pendingShipment} order{pendingShipment > 1 ? 's' : ''} awaiting shipment.{' '}
            <Link href="/sales" className="font-medium underline">View orders</Link>
          </p>
        </div>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Profile Completeness</p>
          <p className="text-2xl font-bold text-gray-900">{artist?.completeness_score ?? 0}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Listings</p>
          <p className="text-2xl font-bold text-gray-900">{listingCount}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900">{totalSales}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{formatPrice(totalRevenue)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/listings/new"><Button>Create Listing</Button></Link>
        <Link href="/profile/edit"><Button variant="outline">Edit Profile</Button></Link>
        <Link href="/sales"><Button variant="outline">Sales</Button></Link>
        <Link href="/commissions"><Button variant="outline">Commissions</Button></Link>
        <Link href="/payouts"><Button variant="outline">Payouts</Button></Link>
        <Link href="/analytics"><Button variant="outline">Analytics</Button></Link>
      </div>
    </div>
  );
}
