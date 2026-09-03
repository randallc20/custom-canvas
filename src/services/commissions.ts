import { supabase } from '@/lib/supabase';
import { Commission } from '@/types/commission';

export async function getCommissionsByArtist(artistId: string): Promise<Commission[]> {
  const { data, error } = await supabase
    .from('commissions')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
