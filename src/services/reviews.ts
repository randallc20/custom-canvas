import { supabase } from '@/lib/supabase';
import { Review } from '@/types/order';

export async function createReview(data: {
  order_id: string;
  reviewer_id: string;
  rating: number;
  comment?: string | null;
}): Promise<Review> {
  const { data: review, error } = await supabase
    .from('reviews')
    .insert({
      order_id: data.order_id,
      reviewer_id: data.reviewer_id,
      rating: data.rating,
      comment: data.comment ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return review;
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
