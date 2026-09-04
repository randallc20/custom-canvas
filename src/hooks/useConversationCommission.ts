'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Commission } from '@/types/commission';

/** The commission behind a conversation, if there is one.
 *
 *  Shared by the rail (`CommissionPanel`) and the thread's quote card so both
 *  read the SAME cache entry — the card used to keep its accepted/declined
 *  state in local `useState`, which meant a reload put Accept and Decline back
 *  on a quote that had already been accepted. Pressing it then 409'd, and the
 *  409's sentence was thrown away by the caller, so the buyer's whole
 *  experience of a commission they had already accepted was "Action failed.
 *  Try again." Reported by a tester on prod, 2026-09-03.
 *
 *  A failed read is not "not found": the queryFn throws rather than returning
 *  null, so a network blip does not read as a missing commission.
 */
export function useConversationCommission(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['commission', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select('*')
        .eq('conversation_id', conversationId!)
        .maybeSingle();
      if (error) throw error;
      return (data as Commission | null) ?? null;
    },
  });
}
