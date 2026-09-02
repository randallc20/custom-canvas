'use client';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { createStripeConnectLink } from '@/services/payments';
import { useArtistSalesTotals } from '@/hooks/useOrders';
import { summarizeSales } from '@/utils/salesTotals';
import { formatPrice } from '@/utils/formatPrice';
import { useState } from 'react';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { useSearchParams } from 'next/navigation';

export function PayoutsSection() {
  const { user } = useAuth();
  const { artist, loading } = useOwnArtistProfile();
  const [connecting, setConnecting] = useState(false);
  const { data: totals } = useArtistSalesTotals(artist?.id ?? '');
  const searchParams = useSearchParams();
  const justSetup = searchParams.get('setup') === 'complete';

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

  // Summed in the database — the old client-side reduce over every order
  // was silently capped by PostgREST past 1,000 rows.
  const { earningsCents: totalEarnings, salesCount: totalSales, awaitingShipment: pendingShipment } = summarizeSales(totals);

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-ink">Payouts</h2>

      {justSetup && (
        <div className="mb-6 rounded-xl border border-sage/40 bg-sage/10 p-4 text-sm text-ink">
          Your Stripe account has been connected! You can now receive payments from sales.
        </div>
      )}

      {artist?.stripe_onboarded ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-sm text-muted">Total Earnings</p>
              <p className="text-2xl font-bold text-ink">{formatPrice(totalEarnings)}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-sm text-muted">Completed Sales</p>
              <p className="text-2xl font-bold text-ink">{totalSales}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <p className="text-sm text-muted">Awaiting Shipment</p>
              <p className="text-2xl font-bold text-ink">{pendingShipment}</p>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-center gap-2">
              <Badge variant="success">Connected</Badge>
              <span className="text-sm text-muted">Stripe account is active</span>
            </div>
            <p className="mt-4 text-sm text-muted">
              Payouts are handled automatically by Stripe. You receive 85% of each sale,
              plus your full shipping charge. Payouts arrive about 14 days after each
              sale — the delay protects you and your buyers if a payment is disputed.
              The full terms are in your{' '}
              <a href="/artist-agreement" className="font-medium text-terra underline">Artist Agreement</a>.
            </p>
            <p className="mt-2 text-sm text-muted">
              To view your payout schedule, balance, and bank account details, visit your Stripe dashboard.
            </p>
            <Button variant="outline" onClick={handleConnect} className="mt-4">
              Open Stripe Dashboard
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card text-center">
          <h2 className="text-lg font-medium text-ink">Connect with Stripe</h2>
          <p className="mt-2 text-sm text-muted">
            Set up your Stripe account to start receiving payouts from sales. The process takes just a few minutes.
          </p>
          <p className="mt-1 text-xs text-muted">You&apos;ll receive 85% of each sale, with payouts deposited directly to your bank account.</p>
          <Button onClick={handleConnect} loading={connecting} className="mt-4">Connect with Stripe</Button>
        </div>
      )}
    </div>
  );
}
