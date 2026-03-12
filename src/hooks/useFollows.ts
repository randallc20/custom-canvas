import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFollowedArtists, followArtist, unfollowArtist, isFollowing, getFollowerCount } from '@/services/follows';

export function useFollowedArtists(profileId: string) {
  return useQuery({
    queryKey: ['follows', profileId],
    queryFn: () => getFollowedArtists(profileId),
    enabled: !!profileId,
  });
}

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
    onSuccess: (_, { profileId, artistId }) => {
      queryClient.invalidateQueries({ queryKey: ['follows', profileId] });
      queryClient.invalidateQueries({ queryKey: ['following', profileId, artistId] });
      queryClient.invalidateQueries({ queryKey: ['follower-count', artistId] });
    },
  });
}
