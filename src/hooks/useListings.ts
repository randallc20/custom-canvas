import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getListingById, createListing, updateListing, deleteListing } from '@/services/listings';
import { Listing } from '@/types/listing';
import { useToast } from '@/components/ui/Toast';
import { toastError } from '@/hooks/toastError';

export function useListing(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => getListingById(id),
    enabled: !!id,
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: createListing,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: toastError(toast, 'useCreateListing'),
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Listing> }) =>
      updateListing(id, data),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ['listing', id] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      // The Studio Work list renders from this key — without it, Publish/edit
      // "succeeds" but the row keeps its old badge until a hard reload.
      void queryClient.invalidateQueries({ queryKey: ['artist-listings'] });
    },
    onError: toastError(toast, 'useUpdateListing'),
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: deleteListing,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['listings'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      // Same staleness as useUpdateListing: the Work list must drop the row.
      void queryClient.invalidateQueries({ queryKey: ['artist-listings'] });
    },
    onError: toastError(toast, 'useDeleteListing'),
  });
}
