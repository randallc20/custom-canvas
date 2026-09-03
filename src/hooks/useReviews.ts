import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createReview } from '@/services/reviews';

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
