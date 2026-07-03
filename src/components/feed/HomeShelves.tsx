'use client';

import { useFeaturedShelf, useNeighborhoodSpotlight } from '@/hooks/useFeatured';
import { ListingShelf } from '@/components/feed/ListingShelf';

/** The homepage's curated front room: an admin-picked Featured shelf plus a
 *  weekly rotating neighborhood spotlight. Both hide themselves when empty;
 *  the marketplace feed below is untouched. */
export function HomeShelves() {
  const featured = useFeaturedShelf();
  const spotlight = useNeighborhoodSpotlight();

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
    </div>
  );
}
