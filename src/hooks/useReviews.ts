import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReviewsByArtist, getReviewByOrderId, createReview } from '@/services/reviews';

export function useArtistReviews(artistId: string) {
  return useQuery({
    queryKey: ['reviews', 'artist', artistId],
    queryFn: () => getReviewsByArtist(artistId),
    enabled: !!artistId,
  });
}

export function useOrderReview(orderId: string) {
  return useQuery({
    queryKey: ['reviews', 'order', orderId],
    queryFn: () => getReviewByOrderId(orderId),
    enabled: !!orderId,
  });
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
