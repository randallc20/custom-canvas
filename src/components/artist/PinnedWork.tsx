import Link from 'next/link';
import Image from 'next/image';
import { listingPriceLabel } from '@/utils/formatPrice';
import type { ListingWithImages } from '@/types/listing';

interface PinnedWorkProps {
  listings: ListingWithImages[];
}

export function PinnedWork({ listings }: PinnedWorkProps) {
  if (listings.length === 0) return null;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-ink">Pinned Work</h2>
      <div className={`grid gap-4 ${listings.length === 1 ? 'grid-cols-1' : listings.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        {listings.map((listing) => {
          const image = listing.images?.find((i) => i.is_primary) ?? listing.images?.[0];
          return (
            <Link key={listing.id} href={`/listing/${listing.id}`} className="group block">
              <div className="card-hover overflow-hidden rounded-xl border border-line bg-surface shadow-card">
                {image ? (
                  <Image
                    src={image.image_url}
                    alt={listing.title}
                    width={600}
                    height={700}
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="aspect-[6/7] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[6/7] items-center justify-center bg-sand">
                    <span className="text-sm text-muted">No image</span>
                  </div>
                )}
                <div className="p-4">
                  <h3 className="truncate font-medium text-ink">{listing.title}</h3>
                  <p className="text-sm text-muted">{listingPriceLabel(listing)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
