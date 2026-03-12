import { supabase } from '@/lib/supabase';
import { Commission } from '@/types/commission';

export async function createCommission(data: Omit<Commission, 'id' | 'status' | 'quoted_price_cents' | 'estimated_completion' | 'artist_notes' | 'created_at' | 'updated_at'>): Promise<Commission> {
  const { data: commission, error } = await supabase
    .from('commissions')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return commission;
}

export async function getCommissionsByArtist(artistId: string): Promise<Commission[]> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getCommissionsByRequester(requesterId: string): Promise<Commission[]> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('requester_id', requesterId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function updateCommissionStatus(
  id: string,
  status: string,
  updates?: Partial<Commission>
): Promise<Commission> {
  const { data, error } = await supabase
    .from('commissions')
    .update({ status, ...updates })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getCommissionById(id: string): Promise<Commission | null> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}
