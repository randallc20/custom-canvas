'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useConfirmPickup, useArtistOrders, useUpdateOrderStatus } from '@/hooks/useOrders';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProtectionBadge } from './ProtectionBadge';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useQueryClient } from '@tanstack/react-query';
import { formatPrice } from '@/utils/formatPrice';
import { useArtistProfileId } from '@/hooks/useArtistProfileId';
import type { Order, OrderStatus } from '@/types/order';

const STATUS_BADGE: Record<OrderStatus, { variant: 'default' | 'success' | 'warning' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  paid: { variant: 'success', label: 'Paid' },
  shipped: { variant: 'default', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  refunded: { variant: 'danger', label: 'Refunded' },
  disputed: { variant: 'danger', label: 'Disputed' },
};

export function SalesSection() {
  const { artistId, loading: loadingArtist } = useArtistProfileId();
  const { data: orders, isLoading } = useArtistOrders(artistId);
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [approvingRefund, setApprovingRefund] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [shipModal, setShipModal] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const confirmPickup = useConfirmPickup();

  // Local pickup: your half of the handoff confirmation. Protection for a
  // pickup order attaches only when the buyer confirms too.
  const handleConfirmHandoff = (order: Order) => {
    confirmPickup.mutate(order.id, {
      onSuccess: (body) =>
        toast(body.bothConfirmed ? 'Handoff confirmed by both of you.' : 'Confirmed — the buyer still needs to confirm their side.', 'success'),
      onError: (e) => { captureException(e, { where: 'SalesSection.confirmHandoff' }); toast(e.message, 'error'); },
    });
  };

  if (loadingArtist || isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleShip = async () => {
    if (!shipModal) return;
    try {
      await updateStatus.mutateAsync({
        id: shipModal.id,
        status: 'shipped',
        updates: { tracking_number: trackingNumber.trim() || null, carrier: carrier || null },
      });
      toast('Order marked as shipped!', 'success');
      setShipModal(null);
      setTrackingNumber('');
      setCarrier('');
    } catch (err) {
      captureException(err, { where: 'SalesSection.updateOrder' });
      toast('Failed to update order', 'error');
    }
  };

  const handleApproveRefund = async (order: Order) => {
    const ok = await confirm({
      title: 'Approve this refund?',
      message: 'Custom Canvas will settle the payment: the buyer gets the price and shipping back, and your payout for this sale is returned. The buyer\'s service fee is not refunded. This can\'t be undone.',
      confirmLabel: 'Approve refund',
      destructive: true,
    });
    if (!ok) return;
    setApprovingRefund(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/approve-refund`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Refund approved — Custom Canvas will settle the payment.', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (e) {
      captureException(e, { where: 'SalesSection.approveRefund' });
      toast(e instanceof Error ? e.message : 'Could not approve the refund', 'error');
    } finally {
      setApprovingRefund(null);
    }
  };

  const handleDelivered = async (orderId: string) => {
    try {
      await updateStatus.mutateAsync({ id: orderId, status: 'delivered' });
      toast('Order marked as delivered', 'success');
    } catch (err) {
      captureException(err, { where: 'SalesSection.updateOrder' });
      toast('Failed to update order', 'error');
    }
  };

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-ink">Sales</h2>

      {!orders || orders.length === 0 ? (
        <EmptyState title="No sales yet" description="When collectors purchase your art, orders will appear here." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const badge = STATUS_BADGE[order.status];
            return (
              <div key={order.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted">Order #{order.id.slice(0, 8)}</p>
                    <div className="mt-1 flex items-baseline gap-3">
                      <p className="font-medium text-ink">{formatPrice(order.amount_cents)}</p>
                      <p className="text-xs text-muted">
                        You receive: {formatPrice(order.artist_payout_cents)}
                      </p>
                    </div>
                    <p className="text-xs text-muted">
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>

                {order.shipping_address && (
                  <div className="mt-3 rounded-lg bg-sand/40 px-3 py-2 text-sm text-muted">
                    <p className="text-xs font-medium text-muted">Ship to:</p>
                    <p>{order.shipping_address.street}</p>
                    <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}</p>
                  </div>
                )}

                {order.tracking_number && (
                  <p className="mt-2 text-xs text-muted">
                    Tracking: <span className="font-mono">{order.tracking_number}</span>
                    {order.carrier && <span className="uppercase"> · {order.carrier}</span>}
                  </p>
                )}

                {/* Seller protection standing, visible before any dispute. */}
                {['paid', 'shipped', 'delivered', 'disputed', 'refunded'].includes(order.status) && (
                  <ProtectionBadge order={order} />
                )}

                <div className="mt-3 flex items-center gap-2">
                  {/* Pickup orders never ship — their path to delivered is the
                      two-sided handoff confirmation. */}
                  {order.is_pickup && ['paid', 'shipped', 'delivered'].includes(order.status) && !order.refund_approved_at && (
                    !order.pickup_confirmed_by_artist_at ? (
                      <Button size="sm" loading={confirmPickup.isPending && confirmPickup.variables === order.id} onClick={() => handleConfirmHandoff(order)}>
                        Confirm pickup handoff
                      </Button>
                    ) : !order.pickup_confirmed_by_buyer_at ? (
                      <span className="text-xs text-muted">You confirmed the handoff — waiting on the buyer.</span>
                    ) : order.status !== 'delivered' ? (
                      <Button size="sm" variant="outline" loading={confirmPickup.isPending && confirmPickup.variables === order.id} onClick={() => handleConfirmHandoff(order)}>
                        Finish confirming handoff
                      </Button>
                    ) : null
                  )}
                  {!order.is_pickup && order.status === 'paid' && (
                    <Button size="sm" onClick={() => setShipModal(order)}>Mark as Shipped</Button>
                  )}
                  {order.status === 'shipped' && (
                    <Button size="sm" variant="outline" onClick={() => handleDelivered(order.id)}>Mark Delivered</Button>
                  )}
                  {['paid', 'shipped', 'delivered'].includes(order.status) && (
                    order.refund_approved_at ? (
                      <span className="text-xs text-muted">Refund approved — Custom Canvas is settling the payment.</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={approvingRefund === order.id}
                        onClick={() => handleApproveRefund(order)}
                      >
                        Approve refund
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={!!shipModal} title="Ship Order" onClose={() => { setShipModal(null); setTrackingNumber(''); setCarrier(''); }}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Enter the carrier and tracking number, then mark this order as shipped.
          </p>
          <div className="rounded-md bg-sand/50 px-3 py-2 text-xs leading-relaxed text-ink">
            <span className="font-medium">Seller protection:</span> a supported carrier and a
            tracking number are required for Custom Canvas to cover a chargeback on this order.
            {shipModal?.signature_required && (
              <> This order is <span className="font-medium">$750 or more</span>, so signature
              confirmation is also required — select it when you buy the label.</>
            )}
          </div>
          <div>
            <label htmlFor="carrier" className="mb-1 block text-sm font-medium text-ink">Carrier</label>
            <select
              id="carrier"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              <option value="">Select a carrier…</option>
              <option value="usps">USPS</option>
              <option value="ups">UPS</option>
              <option value="fedex">FedEx</option>
              <option value="dhl">DHL</option>
            </select>
          </div>
          <Input
            label="Tracking Number"
            placeholder="e.g. 1Z999AA10123456784"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShipModal(null); setTrackingNumber(''); setCarrier(''); }}>Cancel</Button>
            <Button onClick={handleShip} loading={updateStatus.isPending} disabled={!carrier || !trackingNumber.trim()}>
              Confirm Shipment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
