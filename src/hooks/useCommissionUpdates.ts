import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCommissionUpdates, postCommissionUpdate } from '@/services/commissionUpdates';

export function useCommissionUpdates(commissionId: string) {
  return useQuery({
    queryKey: ['commission-updates', commissionId],
    queryFn: () => getCommissionUpdates(commissionId),
    enabled: !!commissionId,
  });
}

export function usePostCommissionUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: postCommissionUpdate,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['commission-updates', v.commissionId] }),
  });
}
