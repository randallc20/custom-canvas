'use client';

import { useEffect, useRef, useState } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { FeedCard } from './FeedCard';
import { FeedFilters } from './FeedFilters';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export function ArtFeed() {
  const [filters, setFilters] = useState<{
    medium?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
  }>({});

  const { listings, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } = useFeed(filters);
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
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
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
