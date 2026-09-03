import { supabase } from '@/lib/supabase';
import { Review } from '@/types/order';

export async function getReviewByOrderId(orderId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
