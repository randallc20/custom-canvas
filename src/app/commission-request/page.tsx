'use client';

import { useSearchParams } from 'next/navigation';
import { CommissionForm } from '@/components/commission/CommissionForm';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CommissionRequestPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['user', 'gallery']}>
        <CommissionRequestContent />
      </AuthGuard>
    </PageShell>
  );
}

function CommissionRequestContent() {
  const searchParams = useSearchParams();
  const artistSlug = searchParams.get('artist') ?? '';
  const [artist, setArtist] = useState<{ id: string; display_name: string } | null>(null);

  useEffect(() => {
    if (!artistSlug) return;
    void supabase.from('artist_profiles').select('id, display_name').eq('slug', artistSlug).single()
      .then(({ data }) => setArtist(data));
  }, [artistSlug]);

  if (!artist) return <p className="py-16 text-center text-muted">Loading artist...</p>;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <CommissionForm artistId={artist.id} artistName={artist.display_name} />
    </div>
  );
}
