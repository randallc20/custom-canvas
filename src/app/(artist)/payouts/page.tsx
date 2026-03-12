'use client';

import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { createStripeConnectLink } from '@/services/payments';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function PayoutsPage() {
  const { user } = useAuth();
  const [artist, setArtist] = useState<{ stripe_account_id: string | null; stripe_onboarded: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('stripe_account_id, stripe_onboarded').eq('profile_id', user.id).single()
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Payouts</h1>
      {artist?.stripe_onboarded ? (
        <div className="rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2">
            <Badge variant="success">Connected</Badge>
            <span className="text-sm text-gray-500">Stripe account is active</span>
          </div>
          <p className="mt-4 text-sm text-gray-500">Payouts are handled automatically by Stripe. You receive 85% of each sale.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 p-6 text-center">
          <h2 className="text-lg font-medium text-gray-900">Connect with Stripe</h2>
          <p className="mt-2 text-sm text-gray-500">Set up your Stripe account to start receiving payouts from sales.</p>
          <Button onClick={handleConnect} loading={connecting} className="mt-4">Connect with Stripe</Button>
        </div>
      )}
    </div>
  );
}
