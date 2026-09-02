'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBuyerOrders, useConfirmPickup } from '@/hooks/useOrders';
import { useFindOrCreateConversation } from '@/hooks/useConversations';
import { useCreateReview } from '@/hooks/useReviews';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ReviewForm } from '@/components/review/ReviewForm';
import { useToast } from '@/components/ui/Toast';
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
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const findOrCreate = useFindOrCreateConversation();
  const confirmPickup = useConfirmPickup();

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleReviewSubmit = async (data: { order_id: string; reviewer_id: string; rating: number; comment?: string }) => {
    await createReview.mutateAsync(data);
  };

  // Local pickup: seller protection only attaches when BOTH parties confirm
  // the handoff, and both confirmations flip the order to delivered.
  const confirmHandoff = (order: Order) => {
    confirmPickup.mutate(order.id, {
      onSuccess: (body) =>
        toast(body.bothConfirmed ? 'Handoff confirmed — enjoy your piece!' : 'Confirmed — waiting for the artist to confirm too.', 'success'),
      onError: (e) => { captureException(e, { where: 'orders.confirmPickup' }); toast(e.message, 'error'); },
    });
  };

  // Refunds are between buyer and artist: the request starts as a chat
  // message; if the artist agrees, Custom Canvas settles the payment.
  const requestRefund = (order: Order) => {
    const artist = order.artist;
    const listing = order.listing;
    if (!user || !artist?.profile_id) return;
    setCancelling(order.id);
    const prefill = `Hi, I'd like to request a refund for my order #${order.id.slice(0, 8)}${listing ? ` of "${listing.title}"` : ''}. `;
    findOrCreate.mutate(
      { userId: user.id, otherUserId: artist.profile_id, contextType: 'listing', contextId: order.listing_id ?? undefined },
      {
        onSuccess: (conversation) => router.push(`/messages/${conversation.id}?prefill=${encodeURIComponent(prefill)}`),
        onError: (e) => { captureException(e, { where: 'orders.messageArtist' }); toast('Could not open the conversation.', 'error'); setCancelling(null); },
      }
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">My Orders</h1>

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
            const alreadyReviewed =
              ((order as { reviews?: unknown[] }).reviews?.length ?? 0) > 0 || reviewedOrders.has(order.id);
            const canReview = order.status === 'delivered' && !alreadyReviewed;
            return (
              <div key={order.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted">Order #{order.id.slice(0, 8)}</p>
                    <p className="mt-1 font-medium text-ink">{formatPrice(order.amount_cents)}</p>
                    <p className="text-xs text-muted">
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                {order.tracking_number && (
                  <div className="mt-3 rounded-md bg-sand/40 px-3 py-2 text-sm">
                    <span className="text-muted">Tracking: </span>
                    <span className="font-mono text-ink">{order.tracking_number}</span>
                  </div>
                )}
                {order.shipping_address && (
                  <p className="mt-2 text-xs text-muted">
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
                {alreadyReviewed && (
                  <p className="mt-3 text-xs text-sageText">Review submitted — thank you!</p>
                )}
                {order.is_pickup && ['paid', 'shipped', 'delivered'].includes(order.status) && !order.refund_approved_at && (
                  <div className="mt-3">
                    {!order.pickup_confirmed_by_buyer_at ? (
                      <Button size="sm" variant="outline" loading={confirmPickup.isPending && confirmPickup.variables === order.id} onClick={() => confirmHandoff(order)}>
                        Confirm pickup handoff
                      </Button>
                    ) : !order.pickup_confirmed_by_artist_at ? (
                      <p className="text-xs text-muted">You confirmed the handoff — waiting for the artist to confirm too.</p>
                    ) : order.status !== 'delivered' ? (
                      /* Both confirmed but the delivered promotion didn't land
                         (transient failure) — this retry reaches the route's
                         self-heal path, which nothing else can. */
                      <Button size="sm" variant="outline" loading={confirmPickup.isPending && confirmPickup.variables === order.id} onClick={() => confirmHandoff(order)}>
                        Finish confirming handoff
                      </Button>
                    ) : null}
                  </div>
                )}
                {['paid', 'shipped', 'delivered'].includes(order.status) && (
                  <div className="mt-3">
                    {order.refund_approved_at ? (
                      <p className="text-xs text-muted">Refund approved — Custom Canvas is settling your payment.</p>
                    ) : (
                      <Button size="sm" variant="ghost" loading={cancelling === order.id} onClick={() => requestRefund(order)}>
                        Request a refund
                      </Button>
                    )}
                  </div>
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
