import { useQuery, useMutation } from '@tanstack/react-query';
import { getArtistAnalytics, trackEvent } from '@/services/analytics';

export function useArtistAnalytics(artistId: string) {
  return useQuery({
    queryKey: ['analytics', artistId],
    queryFn: () => getArtistAnalytics(artistId),
    enabled: !!artistId,
  });
}

export function useTrackEvent() {
  return useMutation({
    mutationFn: trackEvent,
  });
}
