'use client';

import { useAuth } from '@/context/AuthContext';
import { useArtistCommissions } from '@/hooks/useCommissions';
import { CommissionStatus } from '@/components/commission/CommissionStatus';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPrice } from '@/utils/formatPrice';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ArtistCommissionsPage() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');
  const { data: commissions, isLoading } = useArtistCommissions(artistId);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Commissions</h1>
      {!commissions || commissions.length === 0 ? (
        <EmptyState title="No commissions yet" description="Commission requests from buyers will appear here." />
      ) : (
        <div className="space-y-4">
          {commissions.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{c.title}</h3>
                  <p className="mt-1 text-sm text-gray-500">Budget: {formatPrice(c.budget_min_cents)} – {formatPrice(c.budget_max_cents)}</p>
                </div>
                <Badge>{c.status}</Badge>
              </div>
              <div className="mt-3">
                <CommissionStatus commission={c} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
