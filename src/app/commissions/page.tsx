'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useArtistCommissions, useRequesterCommissions } from '@/hooks/useCommissions';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { formatPrice } from '@/utils/formatPrice';
import { formatTime } from '@/utils/formatTime';
import { supabase } from '@/lib/supabase';
import type { Commission } from '@/types/commission';

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  pending: 'warning',
  quoted: 'info',
  accepted: 'info',
  in_progress: 'info',
  completed: 'success',
  delivered: 'success',
  confirmed: 'success',
  disputed: 'danger',
  cancelled: 'danger',
};

export default function CommissionsPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'user', 'gallery']}>
        <CommissionsContent />
      </AuthGuard>
    </PageShell>
  );
}

function CommissionsContent() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');
  const [tab, setTab] = useState<'received' | 'sent'>(user?.role === 'artist' ? 'received' : 'sent');

  const { data: artistCommissions, isLoading: loadingArtist } = useArtistCommissions(artistId);
  const { data: requesterCommissions, isLoading: loadingRequester } = useRequesterCommissions(user?.id ?? '');

  useEffect(() => {
    if (!user || user.role !== 'artist') return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  const isArtist = user?.role === 'artist';
  const isLoading = tab === 'received' ? loadingArtist : loadingRequester;
  const commissions = tab === 'received' ? artistCommissions : requesterCommissions;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Commissions</h1>

      {isArtist && (
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setTab('received')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'received' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Received
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'sent' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Sent
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : !commissions || commissions.length === 0 ? (
        <EmptyState
          title={tab === 'received' ? 'No commission requests yet' : 'No requests sent'}
          description={
            tab === 'received'
              ? 'Commission requests from buyers will appear here.'
              : 'Request a custom piece from an artist\'s profile page.'
          }
        />
      ) : (
        <CommissionList commissions={commissions} />
      )}
    </div>
  );
}

function CommissionList({ commissions }: { commissions: Commission[] }) {
  return (
    <div className="space-y-4">
      {commissions.map((c) => (
        <Link
          key={c.id}
          href={`/commissions/${c.id}`}
          className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-gray-900">{c.title}</h3>
              <p className="mt-1 text-sm text-gray-500">
                Budget: {formatPrice(c.budget_min_cents)} – {formatPrice(c.budget_max_cents)}
              </p>
              {c.quoted_price_cents && (
                <p className="mt-1 text-sm font-medium text-[#E8704A]">
                  Quoted: {formatPrice(c.quoted_price_cents)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={statusVariant[c.status] ?? 'default'}>
                {c.status.replace('_', ' ')}
              </Badge>
              <span className="text-xs text-gray-400">{formatTime(c.created_at)}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
