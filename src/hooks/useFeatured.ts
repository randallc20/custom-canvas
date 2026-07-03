import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFeaturedShelf,
  getNeighborhoodSpotlight,
  getFeaturedAdmin,
  addFeatured,
  removeFeatured,
  updateFeaturedOrder,
} from '@/services/featured';

export function useFeaturedShelf() {
  return useQuery({
    queryKey: ['featured', 'shelf'],
    queryFn: getFeaturedShelf,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNeighborhoodSpotlight() {
  return useQuery({
    queryKey: ['featured', 'spotlight'],
    queryFn: () => getNeighborhoodSpotlight(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeaturedAdmin() {
  return useQuery({
    queryKey: ['featured', 'admin'],
    queryFn: getFeaturedAdmin,
  });
}

export function useAddFeatured() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, displayOrder }: { listingId: string; displayOrder: number }) =>
      addFeatured(listingId, displayOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['featured'] }),
  });
}

export function useRemoveFeatured() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeFeatured,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['featured'] }),
  });
}

export function useUpdateFeaturedOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, displayOrder }: { listingId: string; displayOrder: number }) =>
      updateFeaturedOrder(listingId, displayOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['featured'] }),
  });
}
