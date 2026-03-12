import Link from 'next/link';
import { ListingWithImages } from '@/types/listing';
import { ArtistProfile } from '@/types/artist';
import { ImageCarousel } from './ImageCarousel';
import { formatPrice } from '@/utils/formatPrice';

interface ListingDetailProps {
  listing: ListingWithImages;
  artist: ArtistProfile;
}

export function ListingDetail({ listing, artist }: ListingDetailProps) {
  const dimensions = [listing.width_cm, listing.height_cm, listing.depth_cm]
    .filter(Boolean)
    .join(' x ');

  return (
    <div>
      <ImageCarousel images={listing.images} />
      <div className="mt-6">
        <h1 className="text-2xl font-bold text-gray-900">{listing.title}</h1>
        <Link href={`/artist/${artist.slug}`} className="mt-1 text-sm text-[#E8704A] hover:underline">
          {artist.display_name}
        </Link>
        <p className="mt-4 text-2xl font-bold text-gray-900">{formatPrice(listing.price_cents)}</p>
        <div className="mt-4 space-y-1 text-sm text-gray-500">
          <p>Medium: {listing.medium}</p>
          {dimensions && <p>Dimensions: {dimensions} cm</p>}
          {listing.year_created && <p>Year: {listing.year_created}</p>}
        </div>
        {listing.description && (
          <p className="mt-4 whitespace-pre-wrap text-gray-600">{listing.description}</p>
        )}
        {listing.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {listing.tags.map((tag) => (
              <span key={tag.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
