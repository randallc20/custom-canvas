import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSavedListings, getSavedListingIds, saveListing, unsaveListing } from '@/services/saved';
import { useToast } from '@/components/ui/Toast';
import { toastError } from '@/hooks/toastError';

export function useSavedListings(profileId: string) {
  return useQuery({
    queryKey: ['saved', profileId],
    queryFn: () => getSavedListings(profileId),
    enabled: !!profileId,
  });
}

// Module-level so React Query memoizes the derived Set across renders.
const toIdSet = (ids: string[]) => new Set(ids);

/** Every listing id the viewer has saved, as one query shared by every card
 *  on the page. Replaces a per-card point lookup (100 cards = 100 requests,
 *  and one heart click refetched all of them — 02-P2). */
export function useSavedIds(profileId: string) {
  return useQuery({
    queryKey: ['saved-ids', profileId],
    queryFn: () => getSavedListingIds(profileId),
    enabled: !!profileId,
    select: toIdSet,
  });
}

export function useToggleSave() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const surface = toastError(toast, 'useToggleSave');

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
    // Optimistic: flip the id in the shared set so the heart responds at
    // once, and roll back if the write is refused.
    onMutate: async ({ profileId, listingId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: ['saved-ids', profileId] });
      // Baseline to [] when the set has not loaded yet, so a refused write
      // still rolls back instead of leaving the optimistic flip in place.
      const previous = queryClient.getQueryData<string[]>(['saved-ids', profileId]) ?? [];
      queryClient.setQueryData<string[]>(['saved-ids', profileId], (old = []) =>
        isSaved ? old.filter((id) => id !== listingId) : [...old, listingId]
      );
      return { previous };
    },
    // Call sites fire-and-forget with .mutate() — surface failures here.
    onError: (err, { profileId }, context) => {
      queryClient.setQueryData(['saved-ids', profileId], context?.previous ?? []);
      surface(err);
    },
    // Only the two keys this write can change: the id set and the /saved list.
    onSettled: (_data, _err, { profileId }) => {
      void queryClient.invalidateQueries({ queryKey: ['saved-ids', profileId], exact: true });
      void queryClient.invalidateQueries({ queryKey: ['saved', profileId], exact: true });
    },
  });
}
