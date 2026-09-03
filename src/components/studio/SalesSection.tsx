'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useConfirmPickup, useArtistOrders, useUpdateOrderStatus, useMarkDelivered } from '@/hooks/useOrders';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryError } from '@/components/ui/QueryError';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProtectionBadge } from './ProtectionBadge';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useQueryClient } from '@tanstack/react-query';
import { formatPrice } from '@/utils/formatPrice';
import { buyerTookPossession } from '@/utils/fulfillment';
import { fulfillmentWindow, formatDate } from '@/utils/fulfillmentWindow';
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
  const { data: orders, isLoading, isError, refetch, isFetching } = useArtistOrders(artistId);
  const updateStatus = useUpdateOrderStatus();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [approvingRefund, setApprovingRefund] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [shipModal, setShipModal] = useState<Order | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const confirmPickup = useConfirmPickup();
  const [conceding, setConceding] = useState<string | null>(null);
  const [proposeOrder, setProposeOrder] = useState<Order | null>(null);
  const [proposeDate, setProposeDate] = useState('');
  const [proposeNote, setProposeNote] = useState('');
  const [proposing, setProposing] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [returnAddress, setReturnAddress] = useState({ name: '', street: '', city: '', state: '', zip: '' });
  const [returnInstructions, setReturnInstructions] = useState('');
  const markDelivered = useMarkDelivered();

  // Local pickup: your half of the handoff confirmation. Protection for a
  // pickup order attaches only when the buyer confirms too.
  /** Artist Agreement §4, "Accepting a dispute" (L12). Records a stated
   *  preference, not an outcome — the confirm text says so, because an artist
   *  who reads this as "the dispute is over" has been misled. */
  const handleConcedeDispute = async (order: Order) => {
    const ok = await confirm({
      title: "Tell us you don't want to contest this?",
      message:
        'We will record that you do not wish to contest this dispute. Custom Canvas may still contest it where that is necessary to prevent fraud, protect the platform, or meet our processor\'s requirements — and the dispute stays part of our and the processor\'s records either way. If the order was not Protected, the amount still comes out of your payout.',
      confirmLabel: "Don't contest this dispute",
    });
    if (!ok) return;
    setConceding(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/concede-dispute`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Recorded — support has been told.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['artist-orders'] });
    } catch (e) {
      captureException(e, { where: 'studio.sales.concedeDispute' });
      toast(e instanceof Error ? e.message : 'Could not record that', 'error');
    } finally {
      setConceding(null);
    }
  };

  /** Artist Agreement §7: "If you cannot meet the window. Tell the buyer in
   *  Messages before it expires and offer them the choice of a new date or a
   *  cancellation." This is that offer. */
  const submitProposal = async () => {
    const order = proposeOrder;
    if (!order || !proposeDate) return;
    setProposing(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/propose-ship-by`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ship_by: proposeDate, note: proposeNote || undefined }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(typeof body.error === 'string' ? body.error : 'Could not send that date');
      }
      toast('The buyer has been told, and can accept or cancel.', 'success');
      setProposeOrder(null);
      setProposeDate('');
      setProposeNote('');
      void queryClient.invalidateQueries({ queryKey: ['artist-orders'] });
    } catch (e) {
      captureException(e, { where: 'studio.sales.proposeShipBy' });
      toast(e instanceof Error ? e.message : 'Could not send that date', 'error');
    } finally {
      setProposing(false);
    }
  };

  /** §7's other half: "or cancel and tell the buyer promptly". A full refund,
   *  service fee included — the buyer is not out of pocket for a sale the
   *  artist chose to stop. */
  const handleCancelOrder = async (order: Order) => {
    const ok = await confirm({
      title: 'Cancel this order?',
      message:
        'The buyer is refunded in full — artwork price, shipping, the service fee and all tax — your payout for it is reversed, and the piece goes back on sale. This cannot be undone.',
      confirmLabel: 'Cancel and refund the buyer',
      destructive: true,
    });
    if (!ok) return;
    setCancellingOrder(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel-unshipped`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Cancelled and refunded.', 'success');
      void queryClient.invalidateQueries({ queryKey: ['artist-orders'] });
    } catch (e) {
      captureException(e, { where: 'studio.sales.cancelOrder' });
      toast(e instanceof Error ? e.message : 'Could not cancel that order', 'error');
    } finally {
      setCancellingOrder(null);
    }
  };

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
      const { notifyShippedError } = await updateStatus.mutateAsync({
        id: shipModal.id,
        status: 'shipped',
        updates: { tracking_number: trackingNumber.trim() || null, carrier: carrier || null },
      });
      if (notifyShippedError) {
        toast(`Order marked as shipped, but the buyer's shipping email could not be sent (${notifyShippedError}). Let them know directly.`, 'error');
      } else {
        toast('Order marked as shipped!', 'success');
      }
      setShipModal(null);
      setTrackingNumber('');
      setCarrier('');
    } catch (err) {
      captureException(err, { where: 'SalesSection.updateOrder' });
      toast('Failed to update order', 'error');
    }
  };

  /** L8 / ruling D9: approving a change-of-mind refund now conditions it on
   *  the piece coming back, so the artist has to say where it goes. Asked at
   *  the moment of approval — the only moment they are certainly present —
   *  and never taken from their public profile, which is not an address they
   *  agreed to publish by listing a painting. The buyer sees it only after
   *  approval. */
  const submitApproveRefund = async () => {
    const order = refundOrder;
    if (!order) return;
    // "Did the buyer take possession", not "did it ship" — a collected
    // pickup piece has no shipped_at but is very much in the buyer's hands
    // (r6 money pass, P0).
    const needsReturn = buyerTookPossession(order);
    const missing = needsReturn
      ? (['name', 'street', 'city', 'state', 'zip'] as const).filter((k) => !returnAddress[k].trim())
      : [];
    if (missing.length) {
      toast('The full return address is needed — the buyer is sending the piece back to it.', 'error');
      return;
    }
    setApprovingRefund(order.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/approve-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          needsReturn
            ? { return_address: returnAddress, instructions: returnInstructions.trim() || undefined }
            : {},
        ),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast(
        needsReturn
          ? 'Refund approved. The buyer has the return address and has 7 days to ship it back.'
          : 'Refund approved — Custom Canvas will settle the payment.',
        'success',
      );
      setRefundOrder(null);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['artist-orders'] });
    } catch (e) {
      captureException(e, { where: 'SalesSection.approveRefund' });
      toast(e instanceof Error ? e.message : 'Could not approve the refund', 'error');
    } finally {
      setApprovingRefund(null);
    }
  };

  // Delivery is server-stamped (00050 froze `delivered` and delivered_at for
  // client writes) — the route checks ownership and CASes shipped -> delivered.
  const handleDelivered = (orderId: string) => {
    markDelivered.mutate(orderId, {
      onSuccess: () => toast('Order marked as delivered', 'success'),
      onError: (e) => { captureException(e, { where: 'SalesSection.markDelivered' }); toast(e.message, 'error'); },
    });
  };

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold text-ink">Sales</h2>

      {isError ? (
        <QueryError message="We couldn't load your sales." onRetry={() => refetch()} retrying={isFetching} />
      ) : !orders || orders.length === 0 ? (
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
                    {order.shipping_address.name && <p className="font-medium text-ink">{order.shipping_address.name}</p>}
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

                {/* AA §4, "Accepting a dispute" (L12). */}
                {order.status === 'disputed' && (
                  <div className="mt-3 rounded-lg border border-line bg-sand/40 px-3 py-2 text-xs leading-relaxed text-muted">
                    {order.dispute_conceded_at ? (
                      <p>
                        You told us on{' '}
                        {new Date(order.dispute_conceded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                        that you do not wish to contest this dispute. Support may still contest it
                        where fraud, platform protection or processor requirements call for it.
                      </p>
                    ) : (
                      <>
                        <p>
                          Send any shipping or delivery evidence to support@customcanvas.shop — the
                          bank sets the deadline. If you would rather not fight it, you can tell us
                          so; we will not add a platform penalty just for declining (
                          <a href="/artist-agreement" target="_blank" className="font-medium text-terraText underline underline-offset-2">
                            Artist Agreement §4
                          </a>
                          ).
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          loading={conceding === order.id}
                          onClick={() => handleConcedeDispute(order)}
                        >
                          Don&apos;t contest this dispute
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* L7 — the shipping promise, and the two things §7 asks of
                    an artist who cannot keep it. */}
                {order.status === 'paid' && !order.is_pickup && (() => {
                  const win = fulfillmentWindow(order);
                  return (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs leading-relaxed text-muted">
                        {order.agreed_ship_by ? (
                          <>
                            The buyer agreed to{' '}
                            <span className="font-medium text-ink">{formatDate(order.agreed_ship_by)}</span>.
                            Seller protection is still measured against the original{' '}
                            {win.windowDays}-business-day window — it did not move.
                          </>
                        ) : order.proposed_ship_by ? (
                          <>
                            You proposed shipping by{' '}
                            <span className="font-medium text-ink">{formatDate(order.proposed_ship_by)}</span>.
                            The buyer can accept it or cancel for a full refund. Seller protection
                            is still measured against the original {win.windowDays}-business-day
                            window.
                          </>
                        ) : win.missed ? (
                          <>
                            <span className="font-medium text-ink">This is past its ship-by date</span>{' '}
                            ({win.shipByText}). Ship it now, or offer the buyer a new date — if we
                            hear nothing we will cancel and refund them in full, and the buyer can
                            cancel at any time.
                          </>
                        ) : (
                          <>
                            Ship by <span className="font-medium text-ink">{win.shipByText}</span>{' '}
                            ({win.windowDays} business days from the sale).
                          </>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setProposeOrder(order);
                            setProposeDate('');
                            setProposeNote('');
                          }}
                        >
                          Can&apos;t ship in time
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={cancellingOrder === order.id}
                          onClick={() => handleCancelOrder(order)}
                        >
                          Cancel order
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* Shipping policy, "Local pickup": a no-show is a support
                    process, not something an artist should resolve by
                    cancelling and relisting a piece the buyer may still
                    turn up for (L12). */}
                {order.is_pickup && order.status === 'paid' && !order.pickup_confirmed_by_buyer_at && (
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Buyer hasn&apos;t collected? Give them 7 days from your ready message, then
                    contact support@customcanvas.shop before cancelling.
                  </p>
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
                  {/* Not after the artist approved a refund: shipping then
                      leaves the settle seeing `shipped` and never relisting
                      (04-r4 appendix). */}
                  {!order.is_pickup && order.status === 'paid' && !order.refund_approved_at && (
                    <Button size="sm" onClick={() => setShipModal(order)}>Mark as Shipped</Button>
                  )}
                  {order.status === 'shipped' && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={markDelivered.isPending && markDelivered.variables === order.id}
                      onClick={() => handleDelivered(order.id)}
                    >
                      Mark Delivered
                    </Button>
                  )}
                  {['paid', 'shipped', 'delivered'].includes(order.status) && (
                    order.refund_approved_at ? (
                      <span className="text-xs text-muted">Refund approved — Custom Canvas is settling the payment.</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={approvingRefund === order.id}
                        onClick={() => setRefundOrder(order)}
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

      <Modal
        isOpen={!!refundOrder}
        onClose={() => setRefundOrder(null)}
        title="Approve this refund"
        panelClassName="relative z-10 mx-4 max-h-[90vh] w-full max-w-lg animate-modal-in overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-card"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            Custom Canvas settles the payment after the piece comes back and is inspected: the
            buyer gets the price, shipping and the tax on those back, and your payout for this sale
            is returned. On a change of mind the buyer&apos;s service fee is not refunded, and they
            ordinarily bear return shipping.
          </p>
          {refundOrder && !buyerTookPossession(refundOrder) && (
            <p className="rounded-md bg-sand/60 px-3 py-2 text-sm leading-relaxed text-ink">
              The buyer never received this piece, so there is nothing to send back — no return
              address needed.
            </p>
          )}
          {!!refundOrder && buyerTookPossession(refundOrder) && (
          <div>
            <p className="text-sm font-medium text-ink">Where should they send it?</p>
            <p className="mt-0.5 text-xs text-muted">
              Shown only to this buyer, only after you approve. It is never taken from your public
              profile.
            </p>
            <div className="mt-2 space-y-2">
              <Input
                label="Name"
                value={returnAddress.name}
                onChange={(e) => setReturnAddress({ ...returnAddress, name: e.target.value })}
              />
              <Input
                label="Street"
                value={returnAddress.street}
                onChange={(e) => setReturnAddress({ ...returnAddress, street: e.target.value })}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="City"
                  value={returnAddress.city}
                  onChange={(e) => setReturnAddress({ ...returnAddress, city: e.target.value })}
                />
                <Input
                  label="State"
                  value={returnAddress.state}
                  onChange={(e) => setReturnAddress({ ...returnAddress, state: e.target.value })}
                />
                <Input
                  label="ZIP"
                  value={returnAddress.zip}
                  onChange={(e) => setReturnAddress({ ...returnAddress, zip: e.target.value })}
                />
              </div>
            </div>
          </div>
          )}
          {!!refundOrder && buyerTookPossession(refundOrder) && (
          <div>
            <label htmlFor="return-instructions" className="mb-1 block text-sm font-medium text-ink">
              Packing or insurance instructions (optional)
            </label>
            <textarea
              id="return-instructions"
              rows={3}
              value={returnInstructions}
              onChange={(e) => setReturnInstructions(e.target.value)}
              placeholder="Leave blank and we will send our standard instructions: protective packaging, same condition, tracked service."
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRefundOrder(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={approvingRefund === refundOrder?.id}
              onClick={submitApproveRefund}
            >
              {refundOrder && buyerTookPossession(refundOrder) ? 'Approve and authorise the return' : 'Approve refund'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!proposeOrder}
        onClose={() => setProposeOrder(null)}
        title="Offer the buyer a new ship-by date"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            The Artist Agreement asks you to tell the buyer before the window expires and offer a
            new date or a cancellation. We&apos;ll message and email them with the date; it is then
            their choice to accept it or cancel for a full refund.
          </p>
          <div>
            <label htmlFor="propose-date" className="mb-1 block text-sm font-medium text-ink">
              New ship-by date
            </label>
            <input
              id="propose-date"
              type="date"
              value={proposeDate}
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
              onChange={(e) => setProposeDate(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor="propose-note" className="mb-1 block text-sm font-medium text-ink">
              A note for the buyer (optional)
            </label>
            <textarea
              id="propose-note"
              rows={3}
              value={proposeNote}
              onChange={(e) => setProposeNote(e.target.value)}
              placeholder="What happened, and why this date is realistic."
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>
          <p className="rounded-md bg-sand/60 px-3 py-2 text-xs leading-relaxed text-ink">
            This does not extend seller protection. Requirement 1 is measured against the original
            5 business days from the sale, whatever date the buyer agrees to.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setProposeOrder(null)}>Cancel</Button>
            <Button disabled={!proposeDate} loading={proposing} onClick={submitProposal}>
              Send the new date
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!shipModal} title="Ship Order" onClose={() => { setShipModal(null); setTrackingNumber(''); setCarrier(''); }}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Enter the carrier and tracking number, then mark this order as shipped.
          </p>
          <div className="rounded-md bg-sand/50 px-3 py-2 text-xs leading-relaxed text-ink">
            <span className="font-medium">Seller protection:</span> a supported carrier and a
            tracking number are required for Custom Canvas to cover a chargeback on this order.
            {/* L9: §7 is where the shipping obligations and the coverage
                requirement actually live. */}{' '}
            <a
              href="/artist-agreement"
              target="_blank"
              className="font-medium text-terraText underline underline-offset-2"
            >
              Artist Agreement §7
            </a>{' '}
            covers packing, coverage and signature confirmation.
            {/* A requirement again (ruling D7, DECISIONS.md 2026-09-03):
                Artist Agreement §7 obliges it and Seller Protection makes it
                requirement 4. The artist buys it; Custom Canvas reads the
                carrier's record and records it, which is why this says "we
                record it" rather than asking them to tick anything. */}
            {shipModal?.signature_required && (
              <> This order is <span className="font-medium">$750 or more</span>, so{' '}
              <span className="font-medium">signature confirmation is required</span> for
              protection — add it when you buy the label. Custom Canvas records it from the
              carrier&apos;s record if the order is ever disputed.</>
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
