'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatPrice } from '@/utils/formatPrice';
import {
  useGalleryPicks,
  useAddPick,
  useRemovePick,
  useUpdatePick,
} from '@/hooks/usePartnerPicks';
import { searchPickableListings, PARTNER_PICKS_CAP } from '@/services/partnerPicks';

interface SearchResult {
  id: string;
  title: string;
  price_cents: number;
  artist: { display_name: string } | null;
}

/** "Your picks" — a verified partner's curated shelf. Shows on their public
 *  page and rotates onto the homepage. */
export function PartnerPicksManager({ galleryId }: { galleryId: string }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: picks, isLoading } = useGalleryPicks(galleryId);
  const addMutation = useAddPick();
  const removeMutation = useRemovePick();
  const updateMutation = useUpdatePick();

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [blurbDrafts, setBlurbDrafts] = useState<Record<string, string>>({});

  const rows = picks ?? [];
  const atCap = rows.length >= PARTNER_PICKS_CAP;

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const found = await searchPickableListings(search.trim(), rows.map((r) => r.listing_id));
      setResults(found);
      if (!found.length) toast('No available listings match that title.', 'info');
    } catch (err) {
      captureException(err, { where: 'PartnerPicksManager.search' });
      toast('Search failed.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = (listingId: string) => {
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
    addMutation.mutate(
      { galleryId, listingId, displayOrder: nextOrder },
      {
        onSuccess: () => {
          setResults((prev) => prev.filter((r) => r.id !== listingId));
          toast('Added to your picks.', 'success');
        },
        onError: (err) => { captureException(err, { where: 'PartnerPicksManager.add' }); toast('Could not add that pick.', 'error'); },
      }
    );
  };

  const handleRemove = async (listingId: string) => {
    const ok = await confirm({
      title: 'Remove pick?',
      message: 'The piece stays listed — it just leaves your picks.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    removeMutation.mutate(
      { galleryId, listingId },
      {
        onSuccess: () => toast('Pick removed.', 'success'),
        onError: (err) => { captureException(err, { where: 'PartnerPicksManager.remove' }); toast('Could not remove that pick.', 'error'); },
      }
    );
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const a = rows[index];
    const b = rows[j];
    try {
      if (a.display_order === b.display_order) {
        await Promise.all(
          rows.map((r, i) =>
            updateMutation.mutateAsync({ galleryId, listingId: r.listing_id, updates: { display_order: i } })
          )
        );
      } else {
        await Promise.all([
          updateMutation.mutateAsync({ galleryId, listingId: a.listing_id, updates: { display_order: b.display_order } }),
          updateMutation.mutateAsync({ galleryId, listingId: b.listing_id, updates: { display_order: a.display_order } }),
        ]);
      }
    } catch (err) {
      captureException(err, { where: 'PartnerPicksManager.reorder' });
      toast('Could not reorder picks.', 'error');
    }
  };

  const handleBlurbSave = (listingId: string) => {
    const draft = (blurbDrafts[listingId] ?? '').trim();
    updateMutation.mutate(
      { galleryId, listingId, updates: { blurb: draft || null } },
      {
        onSuccess: () => {
          // Drop the draft so the refetched server value is the source again.
          setBlurbDrafts((d) => {
            const next = { ...d };
            delete next[listingId];
            return next;
          });
          toast('Note saved.', 'success');
        },
        onError: (err) => { captureException(err, { where: 'PartnerPicksManager.blurb' }); toast('Could not save the note.', 'error'); },
      }
    );
  };

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="mt-8 rounded-xl border border-line bg-surface p-6 shadow-card">
      <h2 className="mb-1 text-lg font-semibold text-ink">Your Picks ({rows.length}/{PARTNER_PICKS_CAP})</h2>
      <p className="mb-4 text-sm text-muted">
        Curate up to {PARTNER_PICKS_CAP} pieces from local artists. They show on your public page —
        and your selection rotates onto the Custom Canvas homepage.
      </p>

      {rows.length > 0 && (
        <ul className="mb-6 divide-y divide-line">
          {rows.map((row, index) => {
            const img = row.listing?.images?.find((i) => i.is_primary) ?? row.listing?.images?.[0];
            const draft = blurbDrafts[row.listing_id] ?? row.blurb ?? '';
            return (
              <li key={row.listing_id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 flex-none overflow-hidden rounded-lg bg-sand">
                    {img && <Image src={img.image_url} alt={row.listing?.title ?? 'Pick'} fill sizes="48px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {row.listing ? (
                      <>
                        <p className="truncate text-sm font-medium text-ink">{row.listing.title}</p>
                        <p className="text-xs text-muted">
                          {row.listing.artist?.display_name ?? 'Unknown artist'} · {formatPrice(row.listing.price_cents)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted">Listing unavailable</p>
                    )}
                  </div>
                  {row.listing && row.listing.status !== 'available' && (
                    <Badge variant="warning">{row.listing.status}</Badge>
                  )}
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleMove(index, -1)} disabled={index === 0 || updateMutation.isPending}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => handleMove(index, 1)} disabled={index === rows.length - 1 || updateMutation.isPending}
                      className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move down">↓</button>
                    <Button variant="ghost" size="sm" onClick={() => handleRemove(row.listing_id)} loading={removeMutation.isPending}>
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex gap-2 pl-14">
                  <Input
                    placeholder="Why you chose this piece (optional, shown publicly)"
                    value={draft}
                    maxLength={280}
                    onChange={(e) => setBlurbDrafts((d) => ({ ...d, [row.listing_id]: e.target.value }))}
                  />
                  {draft !== (row.blurb ?? '') && (
                    <Button size="sm" variant="outline" onClick={() => handleBlurbSave(row.listing_id)} loading={updateMutation.isPending}>
                      Save
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {atCap ? (
        <p className="text-sm text-muted">Your picks are full — remove one to feature something new.</p>
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
            <ul className="mt-3 divide-y divide-line">
              {results.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <Link href={`/listing/${r.id}`} target="_blank" className="truncate text-sm font-medium text-ink hover:text-terra">
                      {r.title}
                    </Link>
                    <p className="text-xs text-muted">
                      {r.artist?.display_name ?? 'Unknown artist'} · {formatPrice(r.price_cents)}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleAdd(r.id)} loading={addMutation.isPending}>Pick</Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
