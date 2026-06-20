import { supabase } from '@/lib/supabase';
import type { CommissionUpdate } from '@/types/commissionUpdate';

export async function getCommissionUpdates(commissionId: string): Promise<CommissionUpdate[]> {
  const { data, error } = await supabase
    .from('commission_updates')
    .select('*')
    .eq('commission_id', commissionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function postCommissionUpdate(params: {
  commissionId: string;
  artistId: string;
  note: string;
  photoUrl?: string | null;
  progressPercent?: number | null;
}): Promise<CommissionUpdate> {
  const { data, error } = await supabase
    .from('commission_updates')
    .insert({
      commission_id: params.commissionId,
      artist_id: params.artistId,
      note: params.note,
      photo_url: params.photoUrl ?? null,
      progress_percent: params.progressPercent ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
