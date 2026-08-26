'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useArtistListings } from '@/hooks/useArtist';
import { useUpdatePinned } from '@/hooks/useArtistContent';

const MAX_PINS = 3;

interface PinnedListingSelectorProps {
  artistId: string;
  artistSlug: string;
  initialPinnedIds: string[];
}

export function PinnedListingSelector({ artistId, artistSlug, initialPinnedIds }: PinnedListingSelectorProps) {
  const { data: allListings = [] } = useArtistListings(artistId);
  // Only statuses the public profile renders — pinning a hidden/draft piece
  // would silently vanish from the visitor view.
  const listings = allListings.filter((l: { status: string }) => l.status === 'available' || l.status === 'sold');
  const updatePinned = useUpdatePinned();
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(initialPinnedIds);

  useEffect(() => setSelected(initialPinnedIds), [initialPinnedIds]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_PINS ? [...prev, id] : prev
    );
  };

  const dirty = JSON.stringify(selected) !== JSON.stringify(initialPinnedIds);

  const handleSave = () => {
    updatePinned.mutate(
      { slug: artistSlug, listingIds: selected },
      {
        onSuccess: () => toast('Pinned work updated', 'success'),
        onError: (err) => { captureException(err, { where: 'PinnedListingSelector.save' }); toast(err instanceof Error ? err.message : 'Failed to save', 'error'); },
      }
    );
  };

  if (listings.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Pinned Work</h2>
        <span className="text-sm text-muted">{selected.length}/{MAX_PINS}</span>
      </div>
      <p className="mb-4 text-sm text-muted">Feature up to 3 pieces at the top of your profile.</p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {listings.map((listing) => {
          const image = listing.images?.find((img: { is_primary: boolean }) => img.is_primary) ?? listing.images?.[0];
          const isSelected = selected.includes(listing.id);
          const isDisabled = !isSelected && selected.length >= MAX_PINS;
          return (
            <button
              key={listing.id}
              type="button"
              onClick={() => toggle(listing.id)}
              disabled={isDisabled}
              title={listing.title}
              className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-all duration-150
                ${isSelected ? 'border-terra' : 'border-transparent hover:border-line'}
                ${isDisabled ? 'opacity-40' : ''}`}
            >
              {image ? (
                <Image src={image.image_url} alt={listing.title} fill sizes="120px" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center bg-sand p-1 text-center text-[10px] text-muted">
                  {listing.title}
                </div>
              )}
              {isSelected && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-terra text-xs text-white">
                  {selected.indexOf(listing.id) + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {dirty && (
        <div className="mt-4">
          <Button size="sm" onClick={handleSave} loading={updatePinned.isPending}>Save pinned work</Button>
        </div>
      )}
    </div>
  );
}
