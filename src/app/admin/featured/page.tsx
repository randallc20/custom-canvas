'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import Image from 'next/image';
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
import {
  useFeaturedAdmin,
  useAddFeatured,
  useRemoveFeatured,
  useUpdateFeaturedOrder,
} from '@/hooks/useFeatured';
import { searchFeaturableListings, FEATURED_SHELF_CAP } from '@/services/featured';

export default function AdminFeaturedPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <FeaturedContent />
      </AuthGuard>
    </PageShell>
  );
}

interface SearchResult {
  id: string;
  title: string;
  price_cents: number;
  artist: { display_name: string } | null;
}

function FeaturedContent() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: featured, isLoading } = useFeaturedAdmin();
  const addMutation = useAddFeatured();
  const removeMutation = useRemoveFeatured();
  const orderMutation = useUpdateFeaturedOrder();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const rows = featured ?? [];
  const atCap = rows.length >= FEATURED_SHELF_CAP;

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const found = await searchFeaturableListings(search.trim(), rows.map((r) => r.listing_id));
      setResults(found);
      if (!found.length) toast('No available listings match that title.', 'info');
    } catch (err) {
      captureException(err, { where: 'admin.featured.search' });
      toast('Search failed.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (listingId: string) => {
    // Append after the current max; gaps left by removals are harmless
    // because the shelf only cares about relative order.
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
    addMutation.mutate(
      { listingId, displayOrder: nextOrder },
      {
        onSuccess: () => {
          setResults((prev) => prev.filter((r) => r.id !== listingId));
          toast('Added to the Featured shelf.', 'success');
        },
        onError: (err) => { captureException(err, { where: 'admin.featured.add' }); toast('Could not feature that listing.', 'error'); },
      }
    );
  };

  const handleRemove = async (listingId: string) => {
    const ok = await confirm({
      title: 'Remove from shelf?',
      message: 'The piece stays listed — it just leaves the homepage Featured shelf.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    removeMutation.mutate(listingId, {
      onSuccess: () => toast('Removed from the shelf.', 'success'),
      onError: (err) => { captureException(err, { where: 'admin.featured.remove' }); toast('Could not remove that listing.', 'error'); },
    });
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[index];
    const b = rows[j];
    try {
      if (a.display_order === b.display_order) {
        // Degenerate state (shouldn't happen with append-at-max adds):
        // rewrite dense orders for every row.
        await Promise.all(
          rows.map((r, i) => orderMutation.mutateAsync({ listingId: r.listing_id, displayOrder: i }))
        );
      } else {
        // Swap the two rows' actual order values, not array indices — robust
        // to gaps from past removals.
        await Promise.all([
          orderMutation.mutateAsync({ listingId: a.listing_id, displayOrder: b.display_order }),
          orderMutation.mutateAsync({ listingId: b.listing_id, displayOrder: a.display_order }),
        ]);
      }
    } catch (err) {
      captureException(err, { where: 'admin.featured.reorder' });
      toast('Could not reorder the shelf.', 'error');
    }
  };

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Featured Shelf</h1>
        <p className="mt-1 text-sm text-muted">
          Curate the homepage&apos;s front room — up to {FEATURED_SHELF_CAP} pieces, shown in this
          order. Sold or hidden work drops off automatically.
        </p>
      </div>

      {/* Current shelf */}
      <div className="mb-8 rounded-xl border border-line bg-surface shadow-card">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Nothing featured yet — search below to build the shelf.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row, index) => {
              // listing is null when it's no longer visible (hidden by the
              // artist) — still show the row so it can be removed.
              if (!row.listing) {
                return (
                  <li key={row.listing_id} className="flex items-center gap-4 p-3">
                    <span className="w-6 text-center text-sm text-muted">{index + 1}</span>
                    <div className="h-14 w-14 flex-none rounded-lg bg-sand" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-muted">Listing unavailable</p>
                      <p className="text-sm text-muted">Hidden or withdrawn by the artist — not shown on the shelf.</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(row.listing_id)}
                      loading={removeMutation.isPending}
                    >
                      Remove
                    </Button>
                  </li>
                );
              }
              const img =
                row.listing.images?.find((i) => i.is_primary) ?? row.listing.images?.[0];
              const inactive = row.listing.status !== 'available';
              return (
                <li key={row.listing_id} className="flex items-center gap-4 p-3">
                  <span className="w-6 text-center text-sm text-muted">{index + 1}</span>
                  <div className="relative h-14 w-14 flex-none overflow-hidden rounded-lg bg-sand">
                    {img && (
                      <Image src={img.image_url} alt={row.listing.title} fill sizes="56px" className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{row.listing.title}</p>
                    <p className="text-sm text-muted">
                      {row.listing.artist?.display_name ?? 'Unknown artist'} ·{' '}
                      {formatPrice(row.listing.price_cents)}
                    </p>
                  </div>
                  {inactive && <Badge variant="warning">{row.listing.status} — hidden from shelf</Badge>}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0 || orderMutation.isPending}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMove(index, 1)}
                      disabled={index === rows.length - 1 || orderMutation.isPending}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(row.listing_id)}
                      loading={removeMutation.isPending}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add pieces */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="mb-3 font-medium text-ink">Add a piece</h2>
        {atCap ? (
          <p className="text-sm text-muted">
            The shelf is full ({FEATURED_SHELF_CAP}). Remove something to feature new work.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                placeholder="Search available listings by title…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} loading={searching}>Search</Button>
            </div>
            {results.length > 0 && (
              <ul className="mt-4 divide-y divide-line">
                {results.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <Link href={`/listing/${r.id}`} target="_blank" className="truncate font-medium text-ink hover:text-terra">
                        {r.title}
                      </Link>
                      <p className="text-sm text-muted">
                        {r.artist?.display_name ?? 'Unknown artist'} · {formatPrice(r.price_cents)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => handleAdd(r.id)} loading={addMutation.isPending}>
                      Feature
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
