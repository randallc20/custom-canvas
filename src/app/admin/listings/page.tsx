'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatPrice } from '@/utils/formatPrice';
import { isListingPubliclyVisible } from '@/utils/listingVisibility';
import { supabase } from '@/lib/supabase';

interface AdminListing {
  id: string;
  title: string;
  price_cents: number;
  status: string;
  medium: string | null;
  created_at: string;
  artist: { display_name: string; slug: string; is_live: boolean } | null;
}

export default function AdminListingsPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <ListingsContent />
      </AuthGuard>
    </PageShell>
  );
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  available: 'success',
  sold: 'default',
  draft: 'warning',
  hidden: 'danger',
};

function ListingsContent() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('listings')
      .select('id, title, price_cents, status, medium, created_at, artist:artist_profiles(display_name, slug, is_live)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setListings((data ?? []) as unknown as AdminListing[]);
        setLoading(false);
      });
  }, []);

  const handleRemove = async (id: string) => {
    if (!(await confirm({ title: 'Hide listing?', message: 'This listing will be hidden from buyers.', confirmLabel: 'Hide', destructive: true }))) return;
    const { error } = await supabase
      .from('listings')
      .update({ status: 'hidden' })
      .eq('id', id);

    if (error) {
      toast('Failed to hide listing.', 'error');
      return;
    }

    setListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'hidden' } : l))
    );
    toast('Listing removed.', 'success');
  };

  const filtered = search.trim()
    ? listings.filter(
        (l) =>
          l.title.toLowerCase().includes(search.toLowerCase()) ||
          l.artist?.display_name.toLowerCase().includes(search.toLowerCase())
      )
    : listings;

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Listings ({listings.length})</h1>

      <div className="mb-6">
        <Input
          placeholder="Search by title or artist..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sand/50">
            <tr>
              <th className="px-4 py-3 font-medium text-ink">Title</th>
              <th className="px-4 py-3 font-medium text-ink">Artist</th>
              <th className="px-4 py-3 font-medium text-ink">Price</th>
              <th className="px-4 py-3 font-medium text-ink">Medium</th>
              <th className="px-4 py-3 font-medium text-ink">Status</th>
              <th className="px-4 py-3 font-medium text-ink">Visibility</th>
              <th className="px-4 py-3 font-medium text-ink">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-sand/50">
                <td className="px-4 py-3">
                  <Link href={`/listing/${l.id}`} className="font-medium text-ink hover:text-terra">
                    {l.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">
                  {l.artist ? (
                    <Link href={`/artist/${l.artist.slug}`} className="hover:text-terra">
                      {l.artist.display_name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-ink">{formatPrice(l.price_cents)}</td>
                <td className="px-4 py-3 text-muted">{l.medium ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {/* "available" alone reads as live — but a listing is only
                      public once its artist is approved. Say which it is. */}
                  {isListingPubliclyVisible(l.status, l.artist?.is_live) ? (
                    <Badge variant="success">public</Badge>
                  ) : l.status === 'hidden' || l.status === 'draft' ? (
                    <Badge variant="default">not public</Badge>
                  ) : (
                    <Badge variant="warning">hidden — artist not live</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {l.status !== 'hidden' && (
                    <Button size="sm" variant="outline" onClick={() => handleRemove(l.id)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">No listings found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
