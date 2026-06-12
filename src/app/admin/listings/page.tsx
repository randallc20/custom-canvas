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
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';

interface AdminListing {
  id: string;
  title: string;
  price_cents: number;
  status: string;
  medium: string | null;
  created_at: string;
  artist: { display_name: string; slug: string } | null;
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
  removed: 'danger',
};

function ListingsContent() {
  const { toast } = useToast();
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('listings')
      .select('id, title, price_cents, status, medium, created_at, artist:artist_profiles(display_name, slug)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setListings((data ?? []) as unknown as AdminListing[]);
        setLoading(false);
      });
  }, []);

  const handleRemove = async (id: string) => {
    const { error } = await supabase
      .from('listings')
      .update({ status: 'removed' })
      .eq('id', id);

    if (error) {
      toast('Failed to remove listing.', 'error');
      return;
    }

    setListings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'removed' } : l))
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Listings ({listings.length})</h1>

      <div className="mb-6">
        <Input
          placeholder="Search by title or artist..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Title</th>
              <th className="px-4 py-3 font-medium text-gray-700">Artist</th>
              <th className="px-4 py-3 font-medium text-gray-700">Price</th>
              <th className="px-4 py-3 font-medium text-gray-700">Medium</th>
              <th className="px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/listing/${l.id}`} className="font-medium text-gray-900 hover:text-terra">
                    {l.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {l.artist ? (
                    <Link href={`/artist/${l.artist.slug}`} className="hover:text-terra">
                      {l.artist.display_name}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-900">{formatPrice(l.price_cents)}</td>
                <td className="px-4 py-3 text-gray-500">{l.medium ?? '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[l.status] ?? 'default'}>{l.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {l.status !== 'removed' && (
                    <Button size="sm" variant="outline" onClick={() => handleRemove(l.id)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No listings found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
