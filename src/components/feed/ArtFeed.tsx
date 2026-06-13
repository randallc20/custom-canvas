'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useFeed, useArtistsFeed, type FeedFilters } from '@/hooks/useFeed';
import { FeedCard } from './FeedCard';
import { ArtistBrowseCard } from './ArtistBrowseCard';
import { FeedFilters as FeedFiltersBar, type FeedFilterValues } from './FeedFilters';
import { FilterChip } from '@/components/ui/FilterChip';
import { FeedSkeleton } from './FeedSkeleton';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

type View = 'art' | 'artists';

// URL params are the single source of truth so every search/filter state is
// shareable (the Phase 5 "done when": navbar search reflects in the URL).
function parseFilters(sp: URLSearchParams): { view: View; filters: FeedFilterValues } {
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const list = (k: string) => sp.getAll(k).filter(Boolean);
  return {
    view: sp.get('view') === 'artists' ? 'artists' : 'art',
    filters: {
      search: sp.get('q') ?? undefined,
      medium: sp.get('medium') ?? undefined,
      minPrice: num('minPrice'),
      maxPrice: num('maxPrice'),
      sort: (sp.get('sort') as FeedFilterValues['sort']) ?? undefined,
      neighborhoods: list('neighborhood'),
      schools: list('school'),
      commissionsOpen: sp.get('commissions') === '1' || undefined,
      availability: (sp.get('availability') as FeedFilterValues['availability']) ?? undefined,
    },
  };
}

export function ArtFeed() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { view, filters } = parseFilters(new URLSearchParams(searchParams.toString()));

  const setUrl = useCallback(
    (nextView: View, nextFilters: FeedFilterValues) => {
      const sp = new URLSearchParams();
      if (nextView === 'artists') sp.set('view', 'artists');
      if (nextFilters.search) sp.set('q', nextFilters.search);
      if (nextFilters.medium) sp.set('medium', nextFilters.medium);
      if (nextFilters.minPrice) sp.set('minPrice', String(nextFilters.minPrice));
      if (nextFilters.maxPrice) sp.set('maxPrice', String(nextFilters.maxPrice));
      if (nextFilters.sort && nextFilters.sort !== 'recent') sp.set('sort', nextFilters.sort);
      for (const n of nextFilters.neighborhoods ?? []) sp.append('neighborhood', n);
      for (const s of nextFilters.schools ?? []) sp.append('school', s);
      if (nextFilters.commissionsOpen) sp.set('commissions', '1');
      if (nextFilters.availability) sp.set('availability', nextFilters.availability);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname]
  );

  return view === 'artists' ? (
    <div>
      <ViewToggle view={view} onChange={(v) => setUrl(v, filters)} />
      <ArtistsView search={filters.search} />
    </div>
  ) : (
    <div>
      <ViewToggle view={view} onChange={(v) => setUrl(v, filters)} />
      <FeedFiltersBar filters={filters} onFilterChange={(f) => setUrl('art', f)} />
      <ArtView filters={filters} />
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div className="mb-4 flex gap-2">
      <FilterChip active={view === 'art'} onClick={() => onChange('art')}>Art</FilterChip>
      <FilterChip active={view === 'artists'} onClick={() => onChange('artists')}>Artists</FilterChip>
    </div>
  );
}

function ArtView({ filters }: { filters: FeedFilters }) {
  const { listings, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage, isError } = useFeed(filters);
  const sentinelRef = useInfiniteSentinel(fetchNextPage, hasNextPage, isFetchingNextPage);

  if (isLoading) return <FeedSkeleton />;
  if (isError) return <EmptyState title="Something went wrong" description="We couldn't load the feed. Please try refreshing." />;
  if (listings.length === 0) return <EmptyState title="No art found" description="Try adjusting your filters or check back later." />;

  return (
    <>
      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {listings.map((listing, i) => (
          <div key={listing.id} className="mb-4 break-inside-avoid">
            <FeedCard listing={listing} revealDelayMs={(i % 8) * 50} />
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="py-4">
        {isFetchingNextPage && <div className="flex justify-center"><Spinner /></div>}
      </div>
    </>
  );
}

function ArtistsView({ search }: { search?: string }) {
  const { artists, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage, isError } = useArtistsFeed(search);
  const sentinelRef = useInfiniteSentinel(fetchNextPage, hasNextPage, isFetchingNextPage);

  if (isLoading) return <FeedSkeleton />;
  if (isError) return <EmptyState title="Something went wrong" description="We couldn't load artists. Please try refreshing." />;
  if (artists.length === 0) return <EmptyState title="No artists found" description="Try a different search." />;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {artists.map((artist) => (
          <ArtistBrowseCard key={artist.id} artist={artist} />
        ))}
      </div>
      <div ref={sentinelRef} className="py-4">
        {isFetchingNextPage && <div className="flex justify-center"><Spinner /></div>}
      </div>
    </>
  );
}

function useInfiniteSentinel(
  fetchNextPage: () => void,
  hasNextPage: boolean,
  isFetchingNextPage: boolean
) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);
  return ref;
}
