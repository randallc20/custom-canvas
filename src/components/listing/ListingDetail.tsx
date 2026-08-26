import { ListingWithImages } from '@/types/listing';
import { ImageCarousel } from './ImageCarousel';

interface ListingDetailProps {
  listing: ListingWithImages;
}

export function ListingDetail({ listing }: ListingDetailProps) {
  const dimensions = [listing.width_cm, listing.height_cm, listing.depth_cm]
    .filter(Boolean)
    .join(' x ');

  return (
    <div>
      <ImageCarousel images={listing.images} title={listing.title} />
      <div className="mt-6">
        {/* Title, artist and price live in the right rail (ListingHeader /
            PurchasePanel) so the piece's identity is on screen with the buy
            decision — this column carries the details and the story. */}
        <div className="space-y-1 text-sm text-muted">
          <p>Medium: {listing.medium}</p>
          {dimensions && <p>Dimensions: {dimensions} cm</p>}
          {listing.year_created && <p>Year: {listing.year_created}</p>}
        </div>
        {listing.description && (
          <p className="mt-4 whitespace-pre-wrap text-muted">{listing.description}</p>
        )}
        {listing.ai_involvement === 'assisted' && listing.ai_disclosure && (
          <div className="mt-4 rounded-lg border border-line bg-sand/50 px-3 py-2">
            <p className="text-xs font-medium text-ink">The artist used a generative AI tool</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{listing.ai_disclosure}</p>
          </div>
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
