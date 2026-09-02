import { supabase } from '@/lib/supabase';
import { Review } from '@/types/order';

export async function getReviewsByArtist(artistId: string): Promise<(Review & { reviewer_name?: string })[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*, reviewer:profiles!reviews_reviewer_id_fkey(full_name)')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => {
    const reviewer = r.reviewer as { full_name: string | null } | null;
    return {
      id: r.id as string,
      order_id: r.order_id as string,
      reviewer_id: r.reviewer_id as string | null,
      rating: r.rating as number,
      comment: r.comment as string | null,
      created_at: r.created_at as string,
      reviewer_name: reviewer?.full_name ?? undefined,
    };
  });
}

export async function getReviewByOrderId(orderId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getArtistRating(artistId: string): Promise<{ average: number; count: number }> {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('artist_id', artistId);

  if (error) throw error;

  const ratings = (data ?? []).map((r: Record<string, unknown>) => r.rating as number);
  if (ratings.length === 0) return { average: 0, count: 0 };

  const sum = ratings.reduce((a, b) => a + b, 0);
  return { average: sum / ratings.length, count: ratings.length };
}
