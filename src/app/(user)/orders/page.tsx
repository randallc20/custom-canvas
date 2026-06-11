'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBuyerOrders } from '@/hooks/useOrders';
import { useCreateReview } from '@/hooks/useReviews';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ReviewForm } from '@/components/review/ReviewForm';
import { formatPrice } from '@/utils/formatPrice';
import type { Order, OrderStatus } from '@/types/order';

const STATUS_BADGE: Record<OrderStatus, { variant: 'default' | 'success' | 'warning' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  paid: { variant: 'success', label: 'Paid' },
  shipped: { variant: 'default', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  refunded: { variant: 'danger', label: 'Refunded' },
  disputed: { variant: 'danger', label: 'Disputed' },
};

export default function OrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useBuyerOrders(user?.id ?? '');
  const searchParams = useSearchParams();
  const justPurchased = searchParams.get('success') === 'true';
  const createReview = useCreateReview();
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleReviewSubmit = async (data: { order_id: string; reviewer_id: string; rating: number; comment?: string }) => {
    await createReview.mutateAsync(data);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">My Orders</h1>

      {justPurchased && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Your purchase was successful! The artist will be notified and will ship your piece soon.
        </div>
      )}

      {!orders || orders.length === 0 ? (
        <EmptyState title="No orders yet" description="When you purchase artwork, your orders will appear here." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const badge = STATUS_BADGE[order.status];
            const canReview = order.status === 'delivered' && !reviewedOrders.has(order.id);
            return (
              <div key={order.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Order #{order.id.slice(0, 8)}</p>
                    <p className="mt-1 font-medium text-gray-900">{formatPrice(order.amount_cents)}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                {order.tracking_number && (
                  <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm">
                    <span className="text-gray-500">Tracking: </span>
                    <span className="font-mono text-gray-900">{order.tracking_number}</span>
                  </div>
                )}
                {order.shipping_address && (
                  <p className="mt-2 text-xs text-gray-400">
                    Ships to: {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
                  </p>
                )}
                {canReview && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setReviewOrder(order)}>
                      Leave a Review
                    </Button>
                  </div>
                )}
                {reviewedOrders.has(order.id) && (
                  <p className="mt-3 text-xs text-green-600">Review submitted — thank you!</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={!!reviewOrder}
        title="Leave a Review"
        onClose={() => setReviewOrder(null)}
      >
        {reviewOrder && user && (
          <ReviewForm
            orderId={reviewOrder.id}
            reviewerId={user.id}
            onSubmit={handleReviewSubmit}
            onSuccess={() => {
              setReviewedOrders((prev) => new Set(prev).add(reviewOrder.id));
              setReviewOrder(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
