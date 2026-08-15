'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

interface Application {
  id: string;
  display_name: string | null;
  slug: string;
  city: string | null;
  story: string | null;
  primary_mediums: string[] | null;
  created_at: string;
  listings: { count: number }[];
}

export default function AdminApplicationsPage() {
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
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = () => {
    supabase
      .from('artist_profiles')
      .select('id, display_name, slug, city, story, primary_mediums, created_at, listings(count)')
      .eq('application_status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setApps((data ?? []) as unknown as Application[]);
        setLoading(false);
      });
  };
  useEffect(load, []);

  const decide = async (id: string, action: 'approve' | 'reject', rejectReason?: string) => {
    setActing(id);
    const res = await fetch(`/api/admin/applications/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason: rejectReason }),
    });
    if (res.ok) {
      toast(action === 'approve' ? 'Artist approved — now live' : 'Application rejected', 'success');
      setApps((p) => p.filter((a) => a.id !== id));
      setRejecting(null);
      setReason('');
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Action failed' }));
      toast(error ?? 'Action failed', 'error');
    }
    setActing(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">Artist Applications</h1>
      <p className="mb-6 text-sm text-muted">
        Review new artists before their profile and listings go live on the platform.
      </p>
      {apps.length === 0 ? (
        <EmptyState title="No applications waiting" description="New artist applications will appear here for review." />
      ) : (
        <div className="space-y-4">
          {apps.map((a) => {
            const listingCount = a.listings?.[0]?.count ?? 0;
            return (
              <div key={a.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium text-ink">{a.display_name ?? 'Unnamed artist'}</p>
                    <p className="text-xs text-muted">
                      {a.city ?? 'No city'} · {listingCount} listing{listingCount === 1 ? '' : 's'} · applied{' '}
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Link
                    href={`/artist/${a.slug}`}
                    target="_blank"
                    className="shrink-0 text-sm font-medium text-terra hover:underline"
                  >
                    View profile ↗
                  </Link>
                </div>
                {a.primary_mediums && a.primary_mediums.length > 0 && (
                  <p className="mt-2 text-xs text-muted">{a.primary_mediums.join(', ')}</p>
                )}
                {a.story && <p className="mt-2 line-clamp-3 text-sm text-ink">{a.story}</p>}

                {rejecting === a.id ? (
                  <div className="mt-4 space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="What needs to change before you can approve them? (the artist sees this)"
                      rows={3}
                      className="w-full rounded-lg border border-line p-2 text-sm text-ink focus:border-terra focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={acting === a.id}
                        disabled={!reason.trim()}
                        onClick={() => decide(a.id, 'reject', reason)}
                      >
                        Send rejection
                      </Button>
                      <Button size="sm" variant="ghost" disabled={acting === a.id} onClick={() => { setRejecting(null); setReason(''); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" loading={acting === a.id} onClick={() => decide(a.id, 'approve')}>
                      Approve &amp; go live
                    </Button>
                    <Button size="sm" variant="outline" disabled={acting === a.id} onClick={() => { setRejecting(a.id); setReason(''); }}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
