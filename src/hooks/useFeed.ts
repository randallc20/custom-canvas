import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getFeedListings,
  getFeedArtists,
  getSearchSuggestions,
  getFilterOptions,
  type FeedParams,
} from '@/services/feed';
import { ListingWithImages } from '@/types/listing';

export type FeedFilters = Omit<FeedParams, 'page' | 'limit'>;

export function useFeed(filters: FeedFilters = {}) {
  const query = useInfiniteQuery({
    queryKey: ['feed', filters],
    queryFn: ({ pageParam }) =>
      getFeedListings({ ...filters, page: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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
      getFeedArtists({ search, page: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
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
