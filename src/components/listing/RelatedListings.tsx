import Link from 'next/link';
import Image from 'next/image';
import type { ListingWithImages } from '@/types/listing';
import { formatPrice } from '@/utils/formatPrice';

interface RelatedListingsProps {
  listings: ListingWithImages[];
}

export function RelatedListings({ listings }: RelatedListingsProps) {
  if (listings.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-ink">More From This Artist</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-sand">
                  <span className="text-xs text-muted">No image</span>
                </div>
              )}
              <div className="p-2">
                <p className="truncate text-sm font-medium text-ink">{listing.title}</p>
                <p className="text-sm text-terra">{formatPrice(listing.price_cents)}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
