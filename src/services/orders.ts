import { supabase } from '@/lib/supabase';
import { Order } from '@/types/order';

export async function getOrdersByBuyer(buyerId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    // reviews(id) so the page knows about reviews left in a PREVIOUS session:
    // it used to rely on component state that reset on every load, re-offering
    // "Leave a Review" and then failing the submit with a generic error.
    .select('*, listing:listings(title), artist:artist_profiles(profile_id, display_name), reviews(id)')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getOrdersByArtist(artistId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateOrderStatus(
  id: string,
  status: string,
  updates?: Record<string, unknown>
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status, ...updates })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  if (status === 'shipped') {
    // Server-side send — Resend can't run in the browser (the old inline call
    // here silently never sent) and buyer email is service-role-only (00031).
    fetch(`/api/orders/${id}/notify-shipped`, { method: 'POST' }).catch(() => {});
  }

  return data;
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}
