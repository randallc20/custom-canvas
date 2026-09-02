import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getOrdersByBuyer, getOrdersByArtist, updateOrderStatus, getOrderById } from '@/services/orders';

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrderById(id),
    enabled: !!id,
  });
}

export function useBuyerOrders(buyerId: string) {
  return useQuery({
    queryKey: ['orders', 'buyer', buyerId],
    queryFn: () => getOrdersByBuyer(buyerId),
    enabled: !!buyerId,
  });
}

export function useArtistOrders(artistId: string) {
  return useQuery({
    queryKey: ['orders', 'artist', artistId],
    queryFn: () => getOrdersByArtist(artistId),
    enabled: !!artistId,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, updates }: { id: string; status: string; updates?: Record<string, unknown> }) =>
      updateOrderStatus(id, status, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** The artist confirms delivery of a shipped order. Server-side because the
 *  `delivered` status and `delivered_at` are frozen for client writes (00050);
 *  the route compare-and-swaps shipped -> delivered under the service role. */
export function useMarkDelivered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}/mark-delivered`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not mark the order delivered.');
      return body as { ok: boolean; alreadyDelivered?: boolean };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** Both sides of a local-pickup handoff confirm through this. Invalidation
 *  runs on SETTLED, not just success: the route can 500 with the confirmation
 *  already stamped (only the delivered-promotion failed), and skipping the
 *  refetch there would leave the button rendered over a succeeded write. */
export function useConfirmPickup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}/confirm-pickup`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not confirm the handoff.');
      return body as { confirmed: boolean; bothConfirmed: boolean; alreadyConfirmed?: boolean };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
