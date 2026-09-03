import { useQuery } from '@tanstack/react-query';
import { getArtistAnalytics } from '@/services/analytics';

export function useArtistAnalytics(artistId: string) {
  return useQuery({
    queryKey: ['analytics', artistId],
    queryFn: () => getArtistAnalytics(artistId),
    enabled: !!artistId,
  });
}
