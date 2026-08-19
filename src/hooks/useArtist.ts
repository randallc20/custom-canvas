import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getArtistBySlug, updateArtistProfile, getArtistListings } from '@/services/artists';
import { ArtistProfile } from '@/types/artist';

export function useArtist(slug: string) {
  return useQuery({
    queryKey: ['artist', slug],
    queryFn: () => getArtistBySlug(slug),
    enabled: !!slug,
  });
}

export function useArtistListings(artistId: string) {
  return useQuery({
    queryKey: ['artist-listings', artistId],
    queryFn: () => getArtistListings(artistId),
    enabled: !!artistId,
  });
}

export function useUpdateArtistProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ArtistProfile> }) =>
      updateArtistProfile(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist'] });
      // The Studio setup checklist reads this key — rows must check off the
      // moment the artist saves their profile.
      queryClient.invalidateQueries({ queryKey: ['own-artist-profile'] });
    },
  });
}
