import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReviewsByArtist, getReviewByOrderId } from '@/services/reviews';
import type { Review } from '@/types/order';

// The review write goes through the API route, not a client insert: the
// route is what emails and notifies the artist (05-P2 — the client-side
// insert that replaced it sent nothing, so no review ever reached anyone).
// Same shape as services/listings' listingApi.
async function reviewApi<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Review request failed');
  }
  return res.json();
}

export function createReview(data: {
  order_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string | null;
}): Promise<Review> {
  // reviewer_id is the session user server-side; the form still passes it.
  return reviewApi<Review>('/api/reviews', {
    method: 'POST',
    body: JSON.stringify({ order_id: data.order_id, rating: data.rating, comment: data.comment ?? '' }),
  });
}

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
      // The buyer orders query embeds reviews(id) for "already reviewed".
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
