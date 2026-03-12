import { supabase } from '@/lib/supabase';
import { Order } from '@/types/order';

export async function createOrder(data: Omit<Order, 'id' | 'created_at' | 'updated_at'>): Promise<Order> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return order;
}

export async function getOrdersByBuyer(buyerId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
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
