'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useArtistOrders, useUpdateOrderStatus } from '@/hooks/useOrders';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/types/order';

const STATUS_BADGE: Record<OrderStatus, { variant: 'default' | 'success' | 'warning' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  paid: { variant: 'success', label: 'Paid' },
  shipped: { variant: 'default', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  refunded: { variant: 'danger', label: 'Refunded' },
  disputed: { variant: 'danger', label: 'Disputed' },
};

export default function ArtistOrdersPage() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');
  const { data: orders, isLoading } = useArtistOrders(artistId);
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const [shipModal, setShipModal] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleShip = async () => {
    if (!shipModal) return;
    try {
      await updateStatus.mutateAsync({
        id: shipModal.id,
        status: 'shipped',
        updates: { tracking_number: trackingNumber.trim() || null },
      });
      toast('Order marked as shipped!', 'success');
      setShipModal(null);
      setTrackingNumber('');
    } catch {
      toast('Failed to update order', 'error');
    }
  };

  const handleDelivered = async (orderId: string) => {
    try {
      await updateStatus.mutateAsync({ id: orderId, status: 'delivered' });
      toast('Order marked as delivered', 'success');
    } catch {
      toast('Failed to update order', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Sales</h1>

      {!orders || orders.length === 0 ? (
        <EmptyState title="No sales yet" description="When collectors purchase your art, orders will appear here." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const badge = STATUS_BADGE[order.status];
            return (
              <div key={order.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-400">Order #{order.id.slice(0, 8)}</p>
                    <div className="mt-1 flex items-baseline gap-3">
                      <p className="font-medium text-gray-900">{formatPrice(order.amount_cents)}</p>
                      <p className="text-xs text-gray-500">
                        You receive: {formatPrice(order.artist_payout_cents)}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>

                {order.shipping_address && (
                  <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <p className="text-xs font-medium text-gray-500">Ship to:</p>
                    <p>{order.shipping_address.street}</p>
                    <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}</p>
                  </div>
                )}

                {order.tracking_number && (
                  <p className="mt-2 text-xs text-gray-500">
                    Tracking: <span className="font-mono">{order.tracking_number}</span>
                  </p>
                )}

                <div className="mt-3 flex gap-2">
                  {order.status === 'paid' && (
                    <Button size="sm" onClick={() => setShipModal(order)}>Mark as Shipped</Button>
                  )}
                  {order.status === 'shipped' && (
                    <Button size="sm" variant="outline" onClick={() => handleDelivered(order.id)}>Mark Delivered</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={!!shipModal} title="Ship Order" onClose={() => { setShipModal(null); setTrackingNumber(''); }}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Add a tracking number (optional) and mark this order as shipped.
          </p>
          <Input
            label="Tracking Number"
            placeholder="e.g. 1Z999AA10123456784"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShipModal(null); setTrackingNumber(''); }}>Cancel</Button>
            <Button onClick={handleShip} loading={updateStatus.isPending}>Confirm Shipment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
