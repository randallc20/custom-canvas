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
  listings: { id: string; images: { image_url: string }[] }[];
}

interface UnsubmittedArtist {
  id: string;
  display_name: string | null;
  slug: string;
  city: string | null;
  created_at: string;
  application_status: 'draft' | 'rejected';
  listings: { id: string }[];
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
  const [unsubmitted, setUnsubmitted] = useState<UnsubmittedArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    supabase
      .from('artist_profiles')
      .select('id, display_name, slug, city, story, primary_mediums, created_at, listings(id, images:listing_images(image_url))')
      .eq('application_status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        // Never render the reassuring empty state over a failed query.
        if (error) setLoadError(error.message);
        setApps((data ?? []) as unknown as Application[]);
        setLoading(false);
      });
    // Artists who exist but have NOT submitted. Without this list, an admin
    // sees an empty queue while a draft artist's listings sit invisible —
    // and reasonably concludes the approval flow is broken.
    supabase
      .from('artist_profiles')
      .select('id, display_name, slug, city, created_at, application_status, listings(id)')
      .in('application_status', ['draft', 'rejected'])
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setUnsubmitted((data ?? []) as unknown as UnsubmittedArtist[]);
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
      // 409 = another admin already decided it — refresh the queue.
      if (res.status === 409) load();
    }
    setActing(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (loadError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Couldn&apos;t load applications: {loadError}
        </p>
      </div>
    );
  }

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
            const listingCount = a.listings?.length ?? 0;
            const thumbs = (a.listings ?? [])
              .flatMap((l) => l.images?.slice(0, 1) ?? [])
              .slice(0, 3);
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
                    href={`/artist/${a.slug}?preview=1`}
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
                {thumbs.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {thumbs.map((t) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={t.image_url} src={t.image_url} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
                    ))}
                  </div>
                )}

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
                    <Button
                      size="sm"
                      loading={acting === a.id}
                      disabled={listingCount === 0}
                      onClick={() => decide(a.id, 'approve')}
                    >
                      Approve &amp; go live
                    </Button>
                    {listingCount === 0 && (
                      <span className="self-center text-xs text-muted">No listings — reject with feedback instead.</span>
                    )}
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

      {unsubmitted.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-1 text-lg font-semibold text-ink">Not submitted yet ({unsubmitted.length})</h2>
          <p className="mb-4 text-sm text-muted">
            These artists are still building their shop. Nothing of theirs is public, and there&apos;s
            nothing to approve until they press <span className="font-medium">Submit for review</span> in
            their Studio (it needs a profile photo, a 100-character story, and at least one listing).
          </p>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-sand/50">
                <tr>
                  <th className="px-4 py-2 font-medium text-ink">Artist</th>
                  <th className="px-4 py-2 font-medium text-ink">City</th>
                  <th className="px-4 py-2 font-medium text-ink">Listings</th>
                  <th className="px-4 py-2 font-medium text-ink">Status</th>
                  <th className="px-4 py-2 font-medium text-ink">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {unsubmitted.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <Link href={`/artist/${a.slug}?preview=1`} target="_blank" className="font-medium text-ink hover:text-terra">
                        {a.display_name ?? 'Unnamed artist'}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-muted">{a.city ?? '—'}</td>
                    <td className="px-4 py-2 text-muted">{a.listings?.length ?? 0}</td>
                    <td className="px-4 py-2 text-muted">
                      {a.application_status === 'rejected' ? 'changes requested' : 'building their shop'}
                    </td>
                    <td className="px-4 py-2 text-muted">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
