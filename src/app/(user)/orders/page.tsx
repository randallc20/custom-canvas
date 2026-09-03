'use client';

import { useEffect, useRef, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useBuyerOrders, useConfirmPickup } from '@/hooks/useOrders';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useFindOrCreateConversation } from '@/hooks/useConversations';
import { useCreateReview } from '@/hooks/useReviews';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryError } from '@/components/ui/QueryError';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ReviewForm } from '@/components/review/ReviewForm';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';
import { formatPrice } from '@/utils/formatPrice';
import { fulfillmentWindow, formatDate } from '@/utils/fulfillmentWindow';
import { formatAddress } from '@/utils/orderReturns';
import { useOrderReturns } from '@/hooks/useOrderReturn';
import { refundReasonLabel } from '@/utils/refundSplit';
import type { Order, OrderStatus } from '@/types/order';

const STATUS_BADGE: Record<OrderStatus, { variant: 'default' | 'success' | 'warning' | 'danger'; label: string }> = {
  pending: { variant: 'warning', label: 'Pending' },
  paid: { variant: 'success', label: 'Paid' },
  shipped: { variant: 'default', label: 'Shipped' },
  delivered: { variant: 'success', label: 'Delivered' },
  refunded: { variant: 'danger', label: 'Refunded' },
  disputed: { variant: 'danger', label: 'Disputed' },
};

const CONFIRM_POLL_MS = 3_000;
const CONFIRM_POLL_FOR_MS = 60_000;
const RECENT_ORDER_WINDOW_MS = 2 * 60_000;

export default function OrdersPage() {
  const { user } = useAuth();
  const { data: orders, isLoading, isError, refetch, isFetching } = useBuyerOrders(user?.id ?? '');
  const searchParams = useSearchParams();
  const justPurchased = searchParams.get('success') === 'true';
  const createReview = useCreateReview();
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [acceptDate, setAcceptDate] = useState<string | null>(null);
  const [cancelUnshipped, setCancelUnshipped] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  const findOrCreate = useFindOrCreateConversation();
  const confirmPickup = useConfirmPickup();
  const confirm = useConfirm();
  const { data: returns } = useOrderReturns((orders ?? []).map((o) => o.id));
  const [returnShipping, setReturnShipping] = useState<Order | null>(null);
  const [returnTracking, setReturnTracking] = useState('');
  const [returnCarrier, setReturnCarrier] = useState('usps');
  const [returnBusy, setReturnBusy] = useState(false);

  // Stripe's redirect can land here before checkout.session.completed has
  // written the order row (02-P2), and a 60 s staleTime then kept the empty
  // list. After a purchase, poll every 3 s for up to 60 s until an order from
  // this purchase shows up. The webhook usually beats the redirect, so
  // "created after page load" would miss the very order it is waiting for —
  // anything created in the last two minutes counts (checkout itself takes
  // longer than a few seconds, and the buyer's previous purchase is older).
  const pageLoadedAt = useRef(Date.now());
  const [confirmExpired, setConfirmExpired] = useState(false);
  const hasRecentOrder = (orders ?? []).some(
    (o) => new Date(o.created_at).getTime() >= pageLoadedAt.current - RECENT_ORDER_WINDOW_MS
  );
  const confirming = justPurchased && !hasRecentOrder && !confirmExpired;
  useEffect(() => {
    if (!confirming) return;
    const interval = setInterval(() => { void refetch(); }, CONFIRM_POLL_MS);
    const timeout = setTimeout(() => setConfirmExpired(true), CONFIRM_POLL_FOR_MS);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [confirming, refetch]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleReviewSubmit = async (data: { order_id: string; reviewer_id: string; rating: number; comment?: string }) => {
    await createReview.mutateAsync(data);
  };

  // Local pickup: seller protection only attaches when BOTH parties confirm
  // the handoff, and both confirmations flip the order to delivered.
  /** L7: Artist Agreement §7 points at the federal mail-and-internet-order
   *  rule — the seller needs the buyer's CONSENT to a delay, or must refund
   *  them. This is the consent. */
  /** L8: the only client-reachable write on a return record, and it goes
   *  through a route so shipped_back_at is a server timestamp — the seven-day
   *  window in Terms of Sale §5 is measured against it. */
  const submitReturnShipped = async () => {
    const order = returnShipping;
    if (!order || returnTracking.trim().length < 3) {
      toast('The return instructions ask for a tracking number — enter the one from your receipt.', 'error');
      return;
    }
    setReturnBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/return-shipped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: returnTracking.trim(), carrier: returnCarrier }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Thank you — we will settle your refund once it arrives and is inspected.', 'success');
      setReturnShipping(null);
      setReturnTracking('');
      void refetch();
    } catch (e) {
      captureException(e, { where: 'orders.returnShipped' });
      toast(e instanceof Error ? e.message : 'Could not record that', 'error');
    } finally {
      setReturnBusy(false);
    }
  };

  const acceptNewDate = async (order: Order) => {
    setAcceptDate(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/accept-ship-by`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('New date accepted — the artist has been told.', 'success');
      void refetch();
    } catch (e) {
      captureException(e, { where: 'orders.acceptShipBy' });
      toast(e instanceof Error ? e.message : 'Could not accept that date', 'error');
    } finally {
      setAcceptDate(null);
    }
  };

  /** L7: "they may cancel for a full refund and we will settle it whether or
   *  not you approve" (Terms of Sale §3, Artist Agreement §7). This does not
   *  ask the artist, so the dialog is clear that it is final. */
  const cancelForRefund = async (order: Order) => {
    const ok = await confirm({
      title: 'Cancel this order for a full refund?',
      message:
        'The artist did not ship within the promised window, so this is yours to decide — we will settle it whether or not they agree. You will be refunded the artwork price, shipping, the service fee and all tax. The piece goes back on sale.',
      confirmLabel: 'Cancel and refund me',
      destructive: true,
    });
    if (!ok) return;
    setCancelUnshipped(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel-unshipped`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Cancelled and refunded in full.', 'success');
      void refetch();
    } catch (e) {
      captureException(e, { where: 'orders.cancelUnshipped' });
      toast(e instanceof Error ? e.message : 'Could not cancel that order', 'error');
    } finally {
      setCancelUnshipped(null);
    }
  };

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

      {isError ? (
        <QueryError message="We couldn't load your orders." onRetry={() => refetch()} retrying={isFetching} />
      ) : !orders || orders.length === 0 ? (
        confirming ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
            <Spinner />
            <p className="text-sm text-muted">Confirming your purchase…</p>
          </div>
        ) : (
          <EmptyState title="No orders yet" description="When you purchase artwork, your orders will appear here." />
        )
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const badge = STATUS_BADGE[order.status];
            // reviews.order_id is UNIQUE, so PostgREST embeds reviews(id) as ONE
            // object, not an array — `.length` on it was undefined, every
            // reviewed order re-offered "Leave a Review", and the submit 409'd.
            const embeddedReview = (order as { reviews?: unknown }).reviews;
            const alreadyReviewed =
              (Array.isArray(embeddedReview) ? embeddedReview.length > 0 : !!embeddedReview) ||
              reviewedOrders.has(order.id);
            const canReview = order.status === 'delivered' && !alreadyReviewed;
            return (
              <div key={order.id} className="rounded-lg border border-line p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted">Order #{order.id.slice(0, 8)}</p>
                    {(order.listing?.title || order.artist?.display_name) && (
                      <p className="mt-1 text-sm text-ink">
                        {order.listing?.title && <span className="font-medium">{order.listing.title}</span>}
                        {order.listing?.title && order.artist?.display_name && <span className="text-muted"> · </span>}
                        {/* "Sold by", not "by": the artist is the seller of
                            record, and the buyer must see that after the
                            purchase as well as before it (Terms of Sale §1). */}
                        {order.artist?.display_name && <span className="text-muted">sold by {order.artist.display_name}</span>}
                      </p>
                    )}
                    <p className="mt-1 font-medium text-ink">{formatPrice(order.amount_cents)}</p>
                    <p className="text-xs text-muted">
                      {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  {/* L6: whether the service fee came back is the buyer's
                      most likely question about a refund, so answer it
                      without being asked. */}
                  {order.status === 'refunded' && (
                    <p className="mt-1 text-xs text-muted">{refundReasonLabel(order.refund_reason)}</p>
                  )}
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
                {/* L9 — the timing the Shipping policy actually sets, on the
                    card where the buyer would act on it. None of this was on
                    the product: the 48-hour and 7-day claim windows, the fact
                    that cancelling is asked of the artist before it ships, and
                    the 7-day pickup window. A window nobody is told about is
                    not a window. */}
                {order.status === 'delivered' && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Something wrong? Report visible shipping damage within{' '}
                    <span className="font-medium text-ink">48 hours</span> of delivery, and any
                    other material problem within{' '}
                    <span className="font-medium text-ink">7 days</span> — keep the packaging and
                    photograph everything, including the box. &ldquo;Request a refund&rdquo; below
                    opens the thread with the artist.{' '}
                    <Link href="/shipping-returns" target="_blank" className="text-terraText underline underline-offset-2">
                      Shipping, Returns &amp; Refunds
                    </Link>
                  </p>
                )}
                {/* L7 — the shipping promise, and what the buyer can do when
                    it is missed. Terms of Sale §3 and Artist Agreement §7 give
                    the buyer a unilateral cancel right here; before L7 their
                    only action was to ask the artist and hope. */}
                {/* Only the ACCEPT half goes once a refund is approved.
                    Offering "Accept <new date>" above "Refund approved —
                    Custom Canvas is settling your payment" was a P1 (r11):
                    accepting wrote `agreed_ship_by`, which made the window
                    un-missed and so gave away the buyer's own §3 cancel right,
                    while telling the artist to ship a piece they no longer
                    have a Mark-as-Shipped button for.
                    Hiding the WHOLE block was the next P1 (r12): settling is a
                    manual admin action, so every approved refund sits here for
                    as long as the queue takes, and the buyer was left with no
                    ship-by date and — worse — no Cancel button, which is the
                    one door Terms of Sale §3 grants them "whether or not the
                    artist approves" and which `cancel-unshipped` still opens.
                    Both cards now keep their sentence and lose only the
                    buttons that no longer make sense. */}
                {order.status === 'paid' && !order.is_pickup && (() => {
                  const win = fulfillmentWindow(order);
                  // Once accepted, the offer is settled: show the agreed
                  // date, and the cancel right returns only if THAT is missed
                  // (r5 money pass, P2).
                  const refundApproved = !!order.refund_approved_at;
                  const proposed = order.agreed_ship_by || refundApproved ? null : order.proposed_ship_by;
                  // NOT widened by `refundApproved`: the route only grants the
                  // buyer's cancel once the window is actually missed
                  // (cancel-unshipped, buyer branch), so offering the button
                  // earlier would be a button that 409s. An approved refund
                  // that stalls reaches `win.missed` on its own, and the
                  // sentence below says so.
                  const canCancel = win.missed || !!proposed;
                  return (
                    <div className="mt-3 space-y-2">
                      {refundApproved ? (
                        <p className="text-xs leading-relaxed text-muted">
                          The artist approved your refund and we&apos;re settling it — don&apos;t
                          expect this to ship.{' '}
                          {win.missed ? (
                            <>
                              It&apos;s also past the{' '}
                              <span className="font-medium text-ink">{win.shipByText}</span> ship-by
                              date, so you can cancel it yourself here for a full refund including
                              the service fee.
                            </>
                          ) : (
                            <>
                              If it hasn&apos;t moved by{' '}
                              <span className="font-medium text-ink">{win.shipByText}</span>, you can
                              cancel it yourself here without waiting for us.
                            </>
                          )}
                        </p>
                      ) : proposed ? (
                        <p className="text-xs leading-relaxed text-ink">
                          The artist couldn&apos;t ship within the original window and has proposed{' '}
                          <span className="font-medium">{formatDate(proposed)}</span>. It&apos;s your
                          choice: accept the new date, or cancel for a full refund including the
                          service fee.
                        </p>
                      ) : win.agreed && !win.missed ? (
                        <p className="text-xs leading-relaxed text-muted">
                          You agreed a new ship-by date of{' '}
                          <span className="font-medium text-ink">{win.shipByText}</span>. If the
                          artist misses that, you can cancel for a full refund.
                        </p>
                      ) : win.missed ? (
                        <p className="text-xs leading-relaxed text-ink">
                          This should have shipped by{' '}
                          <span className="font-medium">{win.shipByText}</span> and hasn&apos;t. You
                          can cancel for a full refund — including the service fee — without the
                          artist&apos;s agreement.
                        </p>
                      ) : (
                        <p className="text-xs leading-relaxed text-muted">
                          Ships by <span className="font-medium text-ink">{win.shipByText}</span>.
                          Need to cancel? Ask the artist in Messages before it ships.
                        </p>
                      )}
                      {canCancel && (
                        <div className="flex flex-wrap gap-2">
                          {proposed && (
                            <Button
                              size="sm"
                              variant="outline"
                              loading={acceptDate === order.id}
                              onClick={() => acceptNewDate(order)}
                            >
                              Accept {formatDate(proposed)}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={cancelUnshipped === order.id}
                            onClick={() => cancelForRefund(order)}
                          >
                            Cancel for a full refund
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {order.is_pickup && order.status !== 'delivered' && order.status !== 'refunded' && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Arrange pickup within <span className="font-medium text-ink">7 days</span> of
                    the artist&apos;s ready message. Can&apos;t make it? Tell them in Messages.
                  </p>
                )}
                {/* L8 — the return the refund is conditioned on. Terms of
                    Sale §5: address, seven calendar days, tracking, then
                    inspection. */}
                {(() => {
                  const ret = returns?.[order.id];
                  if (!ret?.authorized_at || !ret.required || ret.waived_at) return null;
                  return (
                    <div className="mt-3 rounded-lg border border-terra/30 bg-terraSoft/40 p-3 text-xs leading-relaxed">
                      <p className="font-medium text-ink">
                        Return authorised
                        {ret.ship_by && <> · ship it back by {formatDate(ret.ship_by)}</>}
                      </p>
                      {ret.return_address && (
                        <p className="mt-1 whitespace-pre-wrap text-muted">
                          Send it to:{'\n'}
                          {formatAddress(ret.return_address)}
                        </p>
                      )}
                      {ret.instructions && <p className="mt-2 text-muted">{ret.instructions}</p>}
                      {ret.received_at ? (
                        <p className="mt-2 text-muted">
                          {ret.inspection_outcome === 'accepted'
                            ? 'Received and inspected — your refund is being settled.'
                            : ret.inspection_outcome === 'rejected'
                            ? 'Received, but the inspection raised a problem. Support will be in touch.'
                            : 'Received — inspection to follow.'}
                        </p>
                      ) : ret.shipped_back_at ? (
                        <p className="mt-2 text-muted">
                          On its way back{ret.tracking_number ? ` — ${ret.carrier?.toUpperCase()} ${ret.tracking_number}` : ''}.
                          Your refund settles once it arrives and is inspected.
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            setReturnShipping(order);
                            setReturnTracking('');
                          }}
                        >
                          I&apos;ve shipped it back
                        </Button>
                      )}
                    </div>
                  );
                })()}

                {['paid', 'shipped', 'delivered'].includes(order.status) && (
                  <div className="mt-3">
                    {order.refund_approved_at ? (
                      <p className="text-xs text-muted">Refund approved — Custom Canvas is settling your payment{returns?.[order.id]?.required && !returns?.[order.id]?.waived_at ? ' once the piece is back with the artist and inspected' : ''}.</p>
                    ) : !order.artist?.profile_id ? (
                      /* The artist's account is gone (00049 keeps the order);
                         there is no thread to start a refund request in. */
                      <p className="text-xs text-muted">The artist’s account is closed — email support@customcanvas.shop about this order.</p>
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
        isOpen={!!returnShipping}
        onClose={() => setReturnShipping(null)}
        title="I’ve shipped it back"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            Your refund is settled after the piece arrives and is reasonably inspected. The return
            instructions ask for a tracked service, so give us the number and we can follow it too.
          </p>
          <div>
            <label htmlFor="return-carrier" className="mb-1 block text-sm font-medium text-ink">Carrier</label>
            <select
              id="return-carrier"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              value={returnCarrier}
              onChange={(e) => setReturnCarrier(e.target.value)}
            >
              <option value="usps">USPS</option>
              <option value="ups">UPS</option>
              <option value="fedex">FedEx</option>
              <option value="dhl">DHL</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Tracking number"
            value={returnTracking}
            onChange={(e) => setReturnTracking(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setReturnShipping(null)}>Cancel</Button>
            <Button loading={returnBusy} onClick={submitReturnShipped}>Confirm</Button>
          </div>
        </div>
      </Modal>

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
