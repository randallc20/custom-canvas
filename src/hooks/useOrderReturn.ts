import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ReturnRecord } from '@/utils/orderReturns';

/** The return record for an order, read under RLS — the 00064 policy lets the
 *  buyer and the order's artist SELECT their own and nobody else (L8).
 *
 *  A single query for every order on the page rather than one per card: the
 *  buyer's Orders page renders a list, and a point lookup per card is the
 *  pattern that cost 100 requests on the feed before 02-P2. */
export function useOrderReturns(orderIds: string[]) {
  const key = [...orderIds].sort();
  return useQuery({
    queryKey: ['order-returns', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_returns')
        .select('*')
        .in('order_id', key);
      if (error) throw error;
      const byOrder: Record<string, ReturnRecord> = {};
      for (const r of (data ?? []) as ReturnRecord[]) byOrder[r.order_id] = r;
      return byOrder;
    },
  });
}
