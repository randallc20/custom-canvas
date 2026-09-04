'use client';

import Link from 'next/link';
import { useLocation } from '@/context/LocationContext';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';

/**
 * The signed-in homepage's heading row, in place of the marketing hero.
 *
 * It deliberately does NOT introduce a new heading: the page already had an
 * `<h2>Discover</h2>` above the grid, and this promotes that to the page's
 * `h1`. Nothing new appears when the hero goes — something redundant
 * disappears, which is what keeps it from reading as a different page.
 *
 * No location control either. The navbar carries "Set location" on every page,
 * and putting a second one here is the same mistake as the two search boxes
 * this round removed. A person with no city set gets one quiet line instead of
 * a call to action.
 */
export function DiscoverHeader() {
  const { location, ready } = useLocation();
  const { artist } = useOwnArtistProfile();
  const noCity = ready && !location?.city;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-bold text-ink">Discover</h1>
        {/* Artists land here like everyone else — they browse too — but they
            should not have to hunt for their own shop. A link, not a redirect. */}
        {artist && (
          <Link
            href="/studio"
            className="text-sm font-medium text-terraText underline-offset-2 hover:underline"
          >
            Go to Studio →
          </Link>
        )}
      </div>
      {noCity && (
        <p className="mt-1 text-sm text-muted">
          Set your city in the top bar to see the art being made around you.
        </p>
      )}
    </div>
  );
}
