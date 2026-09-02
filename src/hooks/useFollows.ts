import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getFollowedArtists,
  getFollowedArtistIds,
  followArtist,
  unfollowArtist,
  isFollowing,
  getFollowerCount,
} from '@/services/follows';
import { useToast } from '@/components/ui/Toast';
import { toastError } from '@/hooks/toastError';

export function useFollowedArtists(profileId: string) {
  return useQuery({
    queryKey: ['follows', profileId],
    queryFn: () => getFollowedArtists(profileId),
    enabled: !!profileId,
  });
}

// Module-level so React Query memoizes the derived Set across renders.
const toIdSet = (ids: string[]) => new Set(ids);

/** Every artist id the viewer follows, as one query shared by every browse
 *  card (the per-card point lookup was an N+1 — 02-P2). */
export function useFollowedIds(profileId: string) {
  return useQuery({
    queryKey: ['followed-ids', profileId],
    queryFn: () => getFollowedArtistIds(profileId),
    enabled: !!profileId,
    select: toIdSet,
  });
}

/** Single-artist check, used by the artist page hero (one query per page). */
export function useIsFollowing(profileId: string, artistId: string) {
  return useQuery({
    queryKey: ['following', profileId, artistId],
    queryFn: () => isFollowing(profileId, artistId),
    enabled: !!profileId && !!artistId,
  });
}

export function useFollowerCount(artistId: string) {
  return useQuery({
    queryKey: ['follower-count', artistId],
    queryFn: () => getFollowerCount(artistId),
    enabled: !!artistId,
  });
}

export function useToggleFollow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const surface = toastError(toast, 'useToggleFollow');

  return useMutation({
    mutationFn: async ({
      profileId,
      artistId,
      isCurrentlyFollowing,
    }: {
      profileId: string;
      artistId: string;
      isCurrentlyFollowing: boolean;
    }) => {
      if (isCurrentlyFollowing) {
        await unfollowArtist(profileId, artistId);
      } else {
        await followArtist(profileId, artistId);
      }
    },
    // Optimistic: flip the id in the shared set so the button responds at
    // once, and roll back if the write is refused.
    onMutate: async ({ profileId, artistId, isCurrentlyFollowing }) => {
      await queryClient.cancelQueries({ queryKey: ['followed-ids', profileId] });
      const previous = queryClient.getQueryData<string[]>(['followed-ids', profileId]);
      queryClient.setQueryData<string[]>(['followed-ids', profileId], (old = []) =>
        isCurrentlyFollowing ? old.filter((id) => id !== artistId) : [...old, artistId]
      );
      return { previous };
    },
    // Call sites fire-and-forget with .mutate() — surface failures here.
    onError: (err, { profileId }, context) => {
      if (context?.previous) queryClient.setQueryData(['followed-ids', profileId], context.previous);
      surface(err);
    },
    onSettled: (_data, _err, { profileId, artistId }) => {
      queryClient.invalidateQueries({ queryKey: ['followed-ids', profileId], exact: true });
      queryClient.invalidateQueries({ queryKey: ['follows', profileId], exact: true });
      queryClient.invalidateQueries({ queryKey: ['following', profileId, artistId] });
      queryClient.invalidateQueries({ queryKey: ['follower-count', artistId] });
    },
  });
}
