import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCommissionsByArtist,
  getCommissionsByRequester,
  createCommission,
  updateCommissionStatus,
} from '@/services/commissions';
import { Commission } from '@/types/commission';

export function useArtistCommissions(artistId: string) {
  return useQuery({
    queryKey: ['commissions', 'artist', artistId],
    queryFn: () => getCommissionsByArtist(artistId),
    enabled: !!artistId,
  });
}

export function useRequesterCommissions(requesterId: string) {
  return useQuery({
    queryKey: ['commissions', 'requester', requesterId],
    queryFn: () => getCommissionsByRequester(requesterId),
    enabled: !!requesterId,
  });
}

export function useCreateCommission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCommission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}

export function useUpdateCommissionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      updates,
    }: {
      id: string;
      status: string;
      updates?: Partial<Commission>;
    }) => updateCommissionStatus(id, status, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
    },
  });
}
