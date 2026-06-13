import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getFeedListings,
  getFeedArtists,
  getSearchSuggestions,
  getFilterOptions,
  type FeedParams,
} from '@/services/feed';
import { ListingWithImages } from '@/types/listing';

export type FeedFilters = Omit<FeedParams, 'cursor' | 'limit'>;

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
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export function useArtistsFeed(search?: string) {
  const query = useInfiniteQuery({
    queryKey: ['artists-feed', search ?? null],
    queryFn: ({ pageParam }) =>
      getFeedArtists({ search, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const artists = query.data?.pages.flatMap((page) => page.artists) ?? [];

  return {
    artists,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

export function useSearchSuggestions(term: string) {
  return useQuery({
    queryKey: ['search-suggest', term],
    queryFn: () => getSearchSuggestions(term),
    enabled: term.trim().length >= 2,
    staleTime: 30_000,
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ['filter-options'],
    queryFn: getFilterOptions,
    staleTime: 5 * 60_000,
  });
}
