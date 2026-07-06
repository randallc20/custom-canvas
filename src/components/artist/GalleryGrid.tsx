import Link from 'next/link';
import Image from 'next/image';
import { ListingWithImages } from '@/types/listing';
import { listingPriceLabel } from '@/utils/formatPrice';
import { EmptyState } from '@/components/ui/EmptyState';

interface GalleryGridProps {
  listings: ListingWithImages[];
}

export function GalleryGrid({ listings }: GalleryGridProps) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="h-10 w-10 text-line" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
        title="No artwork listed yet"
        description="This artist's gallery is waiting for its first piece."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {listings.map((listing) => {
        const primary = listing.images.find((img) => img.is_primary) ?? listing.images[0];
        return (
          <Link
            key={listing.id}
            href={`/listing/${listing.id}`}
            className="group block overflow-hidden rounded-lg bg-sand"
          >
            {primary ? (
              <div className="relative aspect-square">
                <Image
                  src={primary.image_url}
                  alt={listing.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center bg-sand">
                <span className="text-sm text-muted">No image</span>
              </div>
            )}
            <div className="p-3">
              <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
              <p className="mt-0.5 text-sm text-terra">{listingPriceLabel(listing)}</p>
              {listing.medium && (
                <p className="mt-0.5 truncate text-xs text-muted">{listing.medium}</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
