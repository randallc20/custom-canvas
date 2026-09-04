import { ListingWithImages } from '@/types/listing';
import { formatDimensionsFromCm } from '@/utils/dimensions';
import { ImageCarousel } from './ImageCarousel';
import { MatureGate } from './MatureGate';
import type { EditionType } from '@/schemas/listingSchema';

/** The buyer-facing form of the Listing Standards' four categories. The form
 *  labels explain them; here the piece just says what it is. */
const EDITION_TYPE_SHORT: Record<EditionType, string> = {
  original: 'Original work',
  limited_edition: 'Limited edition',
  open_edition: 'Open edition print',
  reproduction: 'Reproduction print',
};

interface ListingDetailProps {
  listing: ListingWithImages;
}

export function ListingDetail({ listing }: ListingDetailProps) {
  const dimensions = formatDimensionsFromCm([listing.width_cm, listing.height_cm, listing.depth_cm]);

  return (
    <div>
      {/* Ruling D8: a mature piece is reachable, but its images are behind
          a notice for a viewer who has not opted in. */}
      <MatureGate isMature={!!listing.is_mature}>
        <ImageCarousel images={listing.images} title={listing.title} listingId={listing.id} />
      </MatureGate>
      <div className="mt-6">
        {/* Title, artist and price live in the right rail (ListingHeader /
            PurchasePanel) so the piece's identity is on screen with the buy
            decision — this column carries the details and the story. */}
        {/* Listing Standards Part one: everything a listing must state, in
            one block above the artist's own words (L4). Edition type leads,
            because for an open edition or a reproduction the standards
            require the piece to identify itself as a print in the first
            displayed line. */}
        <div className="space-y-1 text-sm text-muted">
          <p className="font-medium text-ink">{EDITION_TYPE_SHORT[listing.edition_type ?? 'original']}
            {listing.edition_type === 'limited_edition' && listing.edition_size != null && (
              <>
                {' '}
                — {listing.edition_number != null ? `no. ${listing.edition_number} of ` : 'edition of '}
                {listing.edition_size}
              </>
            )}
            {listing.is_signed && <> · signed</>}
          </p>
          <p>Medium: {listing.medium}</p>
          {dimensions && <p>Dimensions: {dimensions}</p>}
          {listing.year_created && <p>Year: {listing.year_created}</p>}
          {listing.condition_notes && <p>Condition: {listing.condition_notes}</p>}
        </div>
        {listing.handling_notes && (
          <div className="mt-4 rounded-lg border border-line bg-sand/50 px-3 py-2">
            <p className="text-xs font-medium text-ink">Handling and safety</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{listing.handling_notes}</p>
          </div>
        )}
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
