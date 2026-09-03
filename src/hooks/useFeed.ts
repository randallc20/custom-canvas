import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMature } from '@/context/MatureContext';
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
  // Ruling D8. Read here rather than at every call site so no browsing
  // surface can forget it, and keyed into the query so flipping the toggle
  // refetches instead of serving a filtered cache. Before the preference has
  // been read from localStorage it is false — the safe direction — and the
  // first paint therefore never leads with mature work.
  const { showMature } = useMature();

  const query = useInfiniteQuery({
    queryKey: ['feed', filters, showMature],
    queryFn: ({ pageParam }) =>
      getFeedListings({ ...filters, showMature, page: pageParam as number }),
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

export function useArtistsFeed(search?: string, city?: string) {
  const query = useInfiniteQuery({
    queryKey: ['artists-feed', search ?? null, city ?? null],
    queryFn: ({ pageParam }) =>
      getFeedArtists({ search, city, page: pageParam as number }),
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

export function useFilterOptions(city?: string) {
  return useQuery({
    queryKey: ['filter-options', city ?? null],
    queryFn: () => getFilterOptions(city),
    staleTime: 5 * 60_000,
  });
}
