import Link from 'next/link';
import { ListingWithImages } from '@/types/listing';

interface GalleryGridProps {
  listings: ListingWithImages[];
}

export function GalleryGrid({ listings }: GalleryGridProps) {
  if (listings.length === 0) {
    return <p className="text-gray-500">No artwork listed yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
      {listings.map((listing) => {
        const primary = listing.images.find((img) => img.is_primary) ?? listing.images[0];
        return (
          <Link key={listing.id} href={`/listing/${listing.id}`} className="group block overflow-hidden rounded-lg bg-gray-100">
            {primary && (
              <img src={primary.image_url} alt={listing.title} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
            )}
            <div className="p-2">
              <p className="truncate text-sm font-medium text-gray-900">{listing.title}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
