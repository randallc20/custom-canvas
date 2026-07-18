'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

interface VReq {
  id: string;
  connection_type: string;
  details: string;
  links: string | null;
  created_at: string;
  artist: { display_name: string; slug: string } | null;
}

export default function AdminVerificationsPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <Content />
      </AuthGuard>
    </PageShell>
  );
}

function Content() {
  const { toast } = useToast();
  const [reqs, setReqs] = useState<VReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    supabase
      .from('verification_requests')
      .select('id, connection_type, details, links, created_at, artist:artist_profiles(display_name, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => { setReqs((data ?? []) as unknown as VReq[]); setLoading(false); });
  };
  useEffect(load, []);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing(id);
    const res = await fetch(`/api/admin/verifications/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    });
    if (res.ok) { toast(action === 'approve' ? 'Artist verified' : 'Request rejected', 'success'); setReqs((p) => p.filter((r) => r.id !== id)); }
    else toast('Action failed', 'error');
    setActing(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Local Verified Requests</h1>
      {reqs.length === 0 ? (
        <EmptyState title="No pending requests" description="Verification requests will appear here." />
      ) : (
        <div className="space-y-4">
          {reqs.map((r) => (
            <div key={r.id} className="rounded-xl border border-line p-4">
              <p className="font-medium text-ink">{r.artist?.display_name ?? 'Unknown artist'}</p>
              <p className="text-xs text-muted">{r.connection_type}</p>
              <p className="mt-2 text-sm text-ink">{r.details}</p>
              {r.links && <p className="mt-1 text-sm text-terra">{r.links}</p>}
              <div className="mt-4 flex gap-2">
                <Button size="sm" loading={acting === r.id} onClick={() => act(r.id, 'approve')}>Approve</Button>
                <Button size="sm" variant="outline" disabled={acting === r.id} onClick={() => act(r.id, 'reject')}>Reject</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
