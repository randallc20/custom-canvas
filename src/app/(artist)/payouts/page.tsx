'use client';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { createStripeConnectLink } from '@/services/payments';
import { useArtistOrders } from '@/hooks/useOrders';
import { formatPrice } from '@/utils/formatPrice';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams } from 'next/navigation';

export default function PayoutsPage() {
  const { user } = useAuth();
  const [artist, setArtist] = useState<{ id: string; stripe_account_id: string | null; stripe_onboarded: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const { data: orders } = useArtistOrders(artist?.id ?? '');
  const searchParams = useSearchParams();
  const justSetup = searchParams.get('setup') === 'complete';

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, stripe_account_id, stripe_onboarded').eq('profile_id', user.id).single()
      .then(({ data }) => { setArtist(data); setLoading(false); });
  }, [user]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await createStripeConnectLink(user!.id);
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const totalEarnings = orders?.reduce((sum, o) => sum + o.artist_payout_cents, 0) ?? 0;
  const totalSales = orders?.filter((o) => o.status !== 'refunded').length ?? 0;
  const pendingShipment = orders?.filter((o) => o.status === 'paid').length ?? 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Payouts</h1>

      {justSetup && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Your Stripe account has been connected! You can now receive payments from sales.
        </div>
      )}

      {artist?.stripe_onboarded ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">{formatPrice(totalEarnings)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Completed Sales</p>
              <p className="text-2xl font-bold text-gray-900">{totalSales}</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Awaiting Shipment</p>
              <p className="text-2xl font-bold text-gray-900">{pendingShipment}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-2">
              <Badge variant="success">Connected</Badge>
              <span className="text-sm text-gray-500">Stripe account is active</span>
            </div>
            <p className="mt-4 text-sm text-gray-500">
              Payouts are handled automatically by Stripe. You receive 85% of each sale.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              To view your payout schedule, balance, and bank account details, visit your Stripe dashboard.
            </p>
            <Button variant="outline" onClick={handleConnect} className="mt-4">
              Open Stripe Dashboard
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <h2 className="text-lg font-medium text-gray-900">Connect with Stripe</h2>
          <p className="mt-2 text-sm text-gray-500">
            Set up your Stripe account to start receiving payouts from sales. The process takes just a few minutes.
          </p>
          <p className="mt-1 text-xs text-gray-400">You&apos;ll receive 85% of each sale, with payouts deposited directly to your bank account.</p>
          <Button onClick={handleConnect} loading={connecting} className="mt-4">Connect with Stripe</Button>
        </div>
      )}
    </div>
  );
}
