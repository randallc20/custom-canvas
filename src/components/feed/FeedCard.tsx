'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ListingWithImages } from '@/types/listing';
import { listingPriceLabel } from '@/utils/formatPrice';
import { useAuth } from '@/context/AuthContext';
import { useSavedIds, useToggleSave } from '@/hooks/useSaved';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface FeedCardProps {
  listing: ListingWithImages;
  revealDelayMs?: number;
  /** Render the artwork at its own aspect ratio (masonry feed) instead of the
   *  uniform 4:5 crop the horizontal shelves need for even rows. */
  natural?: boolean;
}

export function FeedCard({ listing, revealDelayMs = 0, natural = false }: FeedCardProps) {
  const { user } = useAuth();
  const { data: savedIds } = useSavedIds(user?.id ?? '');
  const isSaved = savedIds?.has(listing.id) ?? false;
  const toggleSave = useToggleSave();
  const revealRef = useScrollReveal<HTMLDivElement>();
  const primaryImage = listing.images.find((img) => img.is_primary) ?? listing.images[0];

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    toggleSave.mutate({
      profileId: user.id,
      listingId: listing.id,
      isSaved,
    });
  };

  return (
    <Link href={`/listing/${listing.id}`} className="group block">
      <div
        ref={revealRef}
        className="reveal card-hover overflow-hidden rounded-xl border border-line bg-surface shadow-card"
        style={{ '--reveal-delay': `${revealDelayMs}ms` } as React.CSSProperties}
      >
        {primaryImage ? (
          <div className={natural ? 'overflow-hidden' : 'relative aspect-[4/5] w-full overflow-hidden'}>
            <Image
              src={primaryImage.image_url}
              alt={listing.title}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className={`object-cover transition-transform duration-300 group-hover:scale-[1.03] ${natural ? 'h-auto w-full' : ''}`}
              {...(natural ? { width: 600, height: 750 } : { fill: true })}
            />
          </div>
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-sand">
            <span className="text-sm text-muted">No image</span>
          </div>
        )}
        <div className="p-3">
          <h3 className="truncate font-sans text-sm font-medium text-ink">{listing.title}</h3>
          <p className="text-xs text-muted">{listing.medium}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">
              {listingPriceLabel(listing)}
            </span>
            {user && (
              <button
                onClick={handleSave}
                // Until the shared saved-ids set has loaded every heart reads
                // "Save", and a click on an already-saved piece posts a duplicate
                // (409). Hold the click until the state is known.
                disabled={!!user && savedIds === undefined}
                className={`transition-colors duration-150 ${isSaved ? 'text-terra' : 'text-muted/60 hover:text-terra'}`}
                aria-label={isSaved ? 'Unsave' : 'Save'}
              >
                <svg
                  key={isSaved ? 'saved' : 'unsaved'}
                  className="h-5 w-5 animate-heart-pop"
                  fill={isSaved ? 'currentColor' : 'none'}
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
