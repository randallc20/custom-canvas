import { useInfiniteQuery } from '@tanstack/react-query';
import { getFeedListings } from '@/services/feed';
import { ListingWithImages } from '@/types/listing';

interface FeedFilters {
  medium?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
}

export function useFeed(filters: FeedFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['feed', filters],
    queryFn: ({ pageParam }) =>
      getFeedListings({ ...filters, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const listings: ListingWithImages[] =
    query.data?.pages.flatMap((page) => page.listings) ?? [];

  return {
    listings,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
