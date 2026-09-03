import { useQuery } from '@tanstack/react-query';
import { getCommissionUpdates } from '@/services/commissionUpdates';

export function useCommissionUpdates(commissionId: string) {
  return useQuery({
    queryKey: ['commission-updates', commissionId],
    queryFn: () => getCommissionUpdates(commissionId),
    enabled: !!commissionId,
  });
}
