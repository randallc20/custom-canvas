import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createReview } from '@/services/reviews';

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
