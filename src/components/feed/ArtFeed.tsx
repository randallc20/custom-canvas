'use client';

import { useEffect, useRef, useState } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { FeedCard } from './FeedCard';
import { FeedFilters, type FeedFilterValues } from './FeedFilters';
import { FeedSkeleton } from './FeedSkeleton';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function ArtFeed() {
  const [filters, setFilters] = useState<FeedFilterValues>({});

  const { listings, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage, isError } = useFeed(filters);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div>
      <FeedFilters filters={filters} onFilterChange={setFilters} />

      {isLoading ? (
        <FeedSkeleton />
      ) : isError ? (
        <EmptyState
          title="Something went wrong"
          description="We couldn't load the feed. Please try refreshing the page."
        />
      ) : listings.length === 0 ? (
        <EmptyState
          title="No art found"
          description="Try adjusting your filters or check back later for new listings."
        />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {listings.map((listing) => (
            <div key={listing.id} className="mb-4 break-inside-avoid">
              <FeedCard listing={listing} />
            </div>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="py-4">
        {isFetchingNextPage && (
          <div className="flex justify-center">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
