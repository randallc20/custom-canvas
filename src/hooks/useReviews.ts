import { useMutation, useQueryClient } from '@tanstack/react-query';
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


export function useCreateReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createReview,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
      // The buyer orders query embeds reviews(id) for "already reviewed".
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
