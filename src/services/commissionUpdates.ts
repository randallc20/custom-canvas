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
