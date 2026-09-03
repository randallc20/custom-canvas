import { useQuery } from '@tanstack/react-query';
import { getCommissionsByArtist } from '@/services/commissions';

export function useArtistCommissions(artistId: string) {
  return useQuery({
    queryKey: ['commissions', 'artist', artistId],
    queryFn: () => getCommissionsByArtist(artistId),
    enabled: !!artistId,
  });
}
