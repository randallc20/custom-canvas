import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSavedListings, saveListing, unsaveListing, isListingSaved } from '@/services/saved';
import { useToast } from '@/components/ui/Toast';
import { toastError } from '@/hooks/toastError';

export function useSavedListings(profileId: string) {
  return useQuery({
    queryKey: ['saved', profileId],
    queryFn: () => getSavedListings(profileId),
    enabled: !!profileId,
  });
}

export function useIsSaved(profileId: string, listingId: string) {
  return useQuery({
    queryKey: ['saved', profileId, listingId],
    queryFn: () => isListingSaved(profileId, listingId),
    enabled: !!profileId && !!listingId,
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      profileId,
      listingId,
      isSaved,
    }: {
      profileId: string;
      listingId: string;
      isSaved: boolean;
    }) => {
      if (isSaved) {
        await unsaveListing(profileId, listingId);
      } else {
        await saveListing(profileId, listingId);
      }
    },
    onSuccess: (_, { profileId, listingId }) => {
      queryClient.invalidateQueries({ queryKey: ['saved', profileId] });
      queryClient.invalidateQueries({ queryKey: ['saved', profileId, listingId] });
    },
    // Call sites fire-and-forget with .mutate() — surface failures here.
    onError: toastError(toast),
  });
}
