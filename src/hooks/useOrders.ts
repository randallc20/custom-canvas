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
