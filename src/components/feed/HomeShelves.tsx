'use client';

import { useFeaturedShelf, useNeighborhoodSpotlight } from '@/hooks/useFeatured';
import { usePartnerPicksShelf } from '@/hooks/usePartnerPicks';
import { ListingShelf } from '@/components/feed/ListingShelf';

/** The homepage's curated front room: an admin-picked Featured shelf plus a
 *  weekly rotating neighborhood spotlight. Both hide themselves when empty;
 *  the marketplace feed below is untouched. */
export function HomeShelves() {
  const featured = useFeaturedShelf();
  const spotlight = useNeighborhoodSpotlight();
  const picks = usePartnerPicksShelf();

  return (
    <div>
      <ListingShelf
        eyebrow="Curated"
        title="Featured in Houston"
        subtitle="Hand-picked work from local artists"
        listings={featured.data}
        isLoading={featured.isLoading}
      />
      {/* No skeleton for the spotlight: it pops in when ready, so an empty
          week doesn't leave a collapsing placeholder above the feed. */}
      <ListingShelf
        eyebrow="This week"
        title={spotlight.data ? `From ${spotlight.data.neighborhood}` : ''}
        subtitle="A rotating look at one Houston neighborhood"
        listings={spotlight.data?.listings}
      />
      {/* Partner picks pop in when ready, same as the spotlight. */}
      <ListingShelf
        eyebrow="Partner picks"
        title={picks.data ? `Picked by ${picks.data.galleryName}` : ''}
        subtitle="Curated by a verified Houston partner"
        listings={picks.data?.listings}
        href={picks.data ? `/gallery/${picks.data.gallerySlug}` : undefined}
        hrefLabel="Visit partner"
      />
    </div>
  );
}
