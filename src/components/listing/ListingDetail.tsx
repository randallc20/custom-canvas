import Link from 'next/link';
import { ListingWithImages } from '@/types/listing';
import { ArtistProfile } from '@/types/artist';
import { ImageCarousel } from './ImageCarousel';
import { formatPrice } from '@/utils/formatPrice';

interface ListingDetailProps {
  listing: ListingWithImages;
  artist: ArtistProfile | null;
}

export function ListingDetail({ listing, artist }: ListingDetailProps) {
  const dimensions = [listing.width_cm, listing.height_cm, listing.depth_cm]
    .filter(Boolean)
    .join(' x ');

  return (
    <div>
      <ImageCarousel images={listing.images} title={listing.title} />
      <div className="mt-6">
        <h1 className="text-2xl font-bold text-ink">{listing.title}</h1>
        {artist && (
          <Link href={`/artist/${artist.slug}`} className="mt-1 text-sm text-terra hover:underline">
            {artist.display_name}
          </Link>
        )}
        <p className="mt-4 text-2xl font-bold text-ink">{formatPrice(listing.price_cents)}</p>
        <div className="mt-4 space-y-1 text-sm text-muted">
          <p>Medium: {listing.medium}</p>
          {dimensions && <p>Dimensions: {dimensions} cm</p>}
          {listing.year_created && <p>Year: {listing.year_created}</p>}
        </div>
        {listing.description && (
          <p className="mt-4 whitespace-pre-wrap text-muted">{listing.description}</p>
        )}
        {listing.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {listing.tags.map((tag) => (
              <span key={tag.id} className="rounded-full bg-sand px-3 py-1 text-xs text-muted">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
