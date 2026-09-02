import { supabase } from '@/lib/supabase';
import { Order, OrderStatus } from '@/types/order';

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

/** The Studio order LIST: newest 200. Money totals do not come from this —
 *  they come from artist_sales_totals below — so the list can be bounded.
 *  Unbounded, PostgREST's max_rows (1,000 by default) silently decided
 *  which rows a top seller saw; 200 is a deliberate, visible cap that is
 *  still far above any artist's realistic count of open orders. */
export async function getOrdersByArtist(artistId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data;
}

export interface ArtistSalesTotalsRow {
  status: OrderStatus;
  order_count: number;
  payout_cents: number;
}

/** Payout and order count per status, summed in the database
 *  (artist_sales_totals, 00051; RLS still applies through the invoker). */
export async function getArtistSalesTotals(artistId: string): Promise<ArtistSalesTotalsRow[]> {
  const { data, error } = await supabase.rpc('artist_sales_totals', { p_artist_id: artistId });
  if (error) throw error;
  return ((data ?? []) as ArtistSalesTotalsRow[]).map((row) => ({
    status: row.status,
    order_count: Number(row.order_count),
    payout_cents: Number(row.payout_cents),
  }));
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
