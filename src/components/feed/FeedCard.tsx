'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ListingWithImages } from '@/types/listing';
import { listingPriceLabel } from '@/utils/formatPrice';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { SaveHeart } from '@/components/listing/SaveHeart';

interface FeedCardProps {
  listing: ListingWithImages;
  revealDelayMs?: number;
  /** Render the artwork at its own aspect ratio (masonry feed) instead of the
   *  uniform 4:5 crop the horizontal shelves need for even rows. */
  natural?: boolean;
}

export function FeedCard({ listing, revealDelayMs = 0, natural = false }: FeedCardProps) {
  const revealRef = useScrollReveal<HTMLDivElement>();
  const primaryImage = listing.images.find((img) => img.is_primary) ?? listing.images[0];

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
            <SaveHeart listingId={listing.id} />
          </div>
        </div>
      </div>
    </Link>
  );
}
