'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { returnBlocksSettlement, type ReturnRecord } from '@/utils/orderReturns';
import {
  calculateRefundSplit,
  isFaultRefund,
  refundReasonLabel,
  type RefundReason,
} from '@/utils/refundSplit';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/order';

interface AdminOrder {
  id: string;
  amount_cents: number;
  shipping_cents: number;
  platform_fee_cents: number;
  artist_payout_cents: number;
  status: OrderStatus;
  created_at: string;
  refund_approved_at: string | null;
  amount_tax_cents: number;
  /** Snapshotted at checkout from the listing price: whether protection
   *  requirement 4 applies to this order at all (L5 / D7). */
  signature_required: boolean;
  signature_confirmed: boolean;
  buyer_fee_cents: number;
  refund_reason: RefundReason | null;
  buyer: { full_name: string | null } | null;
}

/** L6: the reason decides the money AND whether the artist had to agree.
 *  Every reason but change of mind is a fault reason — the whole charge goes
 *  back, and Custom Canvas settles it whether or not the artist approved
 *  (Artist Agreement §8's four exceptions, plus our own error and an artist
 *  cancellation). */
const REFUND_REASON_OPTIONS: { value: RefundReason; label: string }[] = [
  { value: 'change_of_mind', label: 'Change of mind — the artist approved a discretionary return' },
  { value: 'not_shipped', label: 'Never shipped' },
  { value: 'lost_in_transit', label: 'Lost in transit' },
  { value: 'damaged', label: 'Arrived damaged' },
  { value: 'not_as_described', label: 'Materially not as described' },
  { value: 'platform_error', label: 'Our error (obvious pricing, tax or technical error)' },
  { value: 'artist_cancelled', label: 'The artist cancelled before shipping' },
];

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  paid: 'success',
  shipped: 'default',
  delivered: 'success',
  refunded: 'danger',
  disputed: 'danger',
};

export default function AdminOrdersPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <OrdersContent />
      </AuthGuard>
    </PageShell>
  );
}

function OrdersContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [signing, setSigning] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState<AdminOrder | null>(null);
  const [refundReason, setRefundReason] = useState<RefundReason>('change_of_mind');
  const [returns, setReturns] = useState<Record<string, ReturnRecord>>({});
  const [returnBusy, setReturnBusy] = useState<string | null>(null);
  const [authorizeOrder, setAuthorizeOrder] = useState<AdminOrder | null>(null);
  const [authorizeReason, setAuthorizeReason] = useState<RefundReason>('damaged');
  const [authorizeAddress, setAuthorizeAddress] = useState({ name: '', street: '', city: '', state: '', zip: '' });
  const [settling, setSettling] = useState<string | null>(null);
  const { toast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    void supabase
      .from('orders')
      // email is not client-readable (00031) — full_name only.
      .select('id, amount_cents, shipping_cents, platform_fee_cents, artist_payout_cents, amount_tax_cents, buyer_fee_cents, status, created_at, refund_approved_at, refund_reason, signature_required, signature_confirmed, buyer:profiles!orders_buyer_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(async ({ data }) => {
        setOrders((data ?? []) as unknown as AdminOrder[]);
        // L8: the settle gate reads these, so the page has to show them or an
        // admin sees "Refund" refuse with no visible reason.
        const { data: rets } = await supabase.from('order_returns').select('*').limit(500);
        const byOrder: Record<string, ReturnRecord> = {};
        for (const r of (rets ?? []) as unknown as ReturnRecord[]) byOrder[r.order_id] = r;
        setReturns(byOrder);
        setLoading(false);
      });
  }, []);

  /** L6: settling asks WHY first, because the reason decides the split. The
   *  old flow refunded price + shipping + their tax for every reason, which
   *  is the change-of-mind answer applied to orders the documents say we pay
   *  for in full. */
  const handleSettleRefund = async () => {
    const o = refundModal;
    if (!o) return;
    const split = calculateRefundSplit(o, refundReason);
    const ok = await confirm({
      title: 'Settle this refund?',
      message: `${refundReasonLabel(refundReason)}. The buyer gets ${formatPrice(split.refundAmount)} back${
        isFaultRefund(refundReason)
          ? ' — the entire charge, service fee and tax included'
          : ` (the ${formatPrice(o.buyer_fee_cents)} service fee and its tax are retained)`
      }. The artist's payout of ${formatPrice(o.artist_payout_cents)} is reversed; the platform returns its commission.`,
      confirmLabel: 'Refund buyer',
      destructive: true,
    });
    if (!ok) return;
    setSettling(o.id);
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refund_reason: refundReason, reason: refundReasonLabel(refundReason) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Refund settled.', 'success');
      setOrders((prev) =>
        prev.map((x) => (x.id === o.id ? { ...x, status: 'refunded' as OrderStatus, refund_reason: refundReason } : x))
      );
      setRefundModal(null);
    } catch (e) {
      captureException(e, { where: 'admin.orders.refund' });
      toast(e instanceof Error ? e.message : 'Refund failed', 'error');
    } finally {
      setSettling(null);
    }
  };

  /** L8, ruling D13's admin-run minimum. "The refund may be issued after
   *  delivery and reasonable inspection of the returned artwork" — so
   *  recording that inspection is what unblocks the money, and waiving it is
   *  the documented alternative when a return is unlawful, unsafe,
   *  impracticable or unnecessary. */
  const handleReturn = async (o: AdminOrder, body: Record<string, unknown>, title: string, message: string) => {
    const ok = await confirm({ title, message, confirmLabel: title });
    if (!ok) return;
    setReturnBusy(o.id);
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error?.toString() || 'Failed');
      toast('Recorded.', 'success');
      const { data: rets } = await supabase.from('order_returns').select('*').eq('order_id', o.id);
      const row = (rets ?? [])[0] as unknown as ReturnRecord | undefined;
      if (row) setReturns((prev) => ({ ...prev, [o.id]: row }));
    } catch (e) {
      captureException(e, { where: 'admin.orders.return' });
      toast(e instanceof Error ? e.message : 'Could not record that', 'error');
    } finally {
      setReturnBusy(null);
    }
  };

  /** Ruling D7: seller-protection requirement 4 is satisfied by Custom Canvas
   *  reading the carrier's signature record, not by anything the artist can
   *  do. This is the only writer. Do it BEFORE responding to a dispute — the
   *  assessment is frozen once (see docs/runbook.md, chargebacks). */
  const handleRecordSignature = async (o: AdminOrder) => {
    const ok = await confirm({
      title: 'Record signature confirmation?',
      message:
        'Only after opening the carrier tracking page and seeing an actual signature event for this order. This becomes seller-protection evidence and cannot be undone from here.',
      confirmLabel: 'I checked the carrier record',
    });
    if (!ok) return;
    setSigning(o.id);
    try {
      const res = await fetch(`/api/admin/orders/${o.id}/signature-confirmed`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      toast('Signature confirmation recorded.', 'success');
      setOrders((prev) => prev.map((x) => (x.id === o.id ? { ...x, signature_confirmed: true } : x)));
    } catch (e) {
      captureException(e, { where: 'admin.orders.signatureConfirmed' });
      toast(e instanceof Error ? e.message : 'Could not record it', 'error');
    } finally {
      setSigning(null);
    }
  };

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter((o) => o.status === statusFilter);

  // Refunded orders had their charge reversed — exclude from financial totals.
  const settled = orders.filter((o) => o.status !== 'refunded');
  const totalRevenue = settled.reduce((sum, o) => sum + o.amount_cents, 0);
  const totalFees = settled.reduce((sum, o) => sum + o.platform_fee_cents, 0);
  const totalPayouts = settled.reduce((sum, o) => sum + o.artist_payout_cents, 0);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Orders ({orders.length})</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Total Revenue</p>
          <p className="text-2xl font-bold text-ink">{formatPrice(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Platform Revenue (15% commission)</p>
          <p className="text-2xl font-bold text-terraText">{formatPrice(totalFees)}</p>
        </div>
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Artist Payouts</p>
          <p className="text-2xl font-bold text-ink">{formatPrice(totalPayouts)}</p>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="refunded">Refunded</option>
          <option value="disputed">Disputed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sand/50">
            <tr>
              <th className="px-4 py-3 font-medium text-ink">Order</th>
              <th className="px-4 py-3 font-medium text-ink">Buyer</th>
              <th className="px-4 py-3 font-medium text-ink">Amount</th>
              <th className="px-4 py-3 font-medium text-ink">Commission</th>
              <th className="px-4 py-3 font-medium text-ink">Status</th>
              <th className="px-4 py-3 font-medium text-ink">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-sand/50">
                <td className="px-4 py-3 font-mono text-xs text-muted">#{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-ink">
                  {o.buyer?.full_name ?? '—'}
                </td>
                <td className="px-4 py-3 font-medium text-ink">{formatPrice(o.amount_cents)}</td>
                <td className="px-4 py-3 text-muted">{formatPrice(o.platform_fee_cents)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[o.status]}>{o.status}</Badge>
                    {/* Not on a disputed order: Stripe refuses refunds while a
                        chargeback is open, and the route answers 409. */}
                    {/* Shown on any live order now, not only artist-approved
                        ones: a fault refund is settled whether or not the
                        artist agrees (L6). Still never on a disputed order —
                        Stripe refuses while a chargeback is open. */}
                    {o.status !== 'refunded' && o.status !== 'disputed' && o.status !== 'pending' && (
                      <Button
                        size="sm"
                        variant={o.refund_approved_at ? 'danger' : 'outline'}
                        loading={settling === o.id}
                        onClick={() => {
                          setRefundReason(o.refund_approved_at ? 'change_of_mind' : 'not_shipped');
                          setRefundModal(o);
                        }}
                      >
                        {o.refund_approved_at ? 'Settle refund' : 'Refund…'}
                      </Button>
                    )}
                    {o.status === 'refunded' && o.refund_reason && (
                      <span className="text-xs text-muted">{refundReasonLabel(o.refund_reason)}</span>
                    )}
                    {/* L8 — require a return on a FAULT refund. The route
                        has always supported this; nothing called it, so in
                        practice a return could only ever be required on the
                        artist's change-of-mind path (r8 money pass, P1). */}
                    {!returns[o.id] && o.status !== 'refunded' && o.status !== 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAuthorizeReason('damaged');
                          setAuthorizeAddress({ name: '', street: '', city: '', state: '', zip: '' });
                          setAuthorizeOrder(o);
                        }}
                      >
                        Require a return…
                      </Button>
                    )}
                    {/* L8 — the return the settle gate is waiting on. */}
                    {(() => {
                      const ret = returns[o.id];
                      if (!ret || o.status === 'refunded') return null;
                      const blocked = returnBlocksSettlement(ret);
                      if (!blocked) {
                        return <span className="text-xs text-sageText">Return cleared</span>;
                      }
                      return (
                        <>
                          <span className="text-xs text-amber-700" title={blocked}>
                            {ret.received_at ? 'Return received — inspect it' : ret.shipped_back_at ? 'Return in transit' : 'Awaiting return'}
                          </span>
                          {ret.received_at == null && ret.shipped_back_at != null && (
                            <Button size="sm" variant="outline" loading={returnBusy === o.id}
                              onClick={() => handleReturn(o, { action: 'receive', outcome: 'accepted' }, 'Received & inspected',
                                'Record that the piece arrived and passed a reasonable inspection. This is what unblocks the refund.')}>
                              Received &amp; accepted
                            </Button>
                          )}
                          {ret.received_at != null && ret.inspection_outcome == null && (
                            <Button size="sm" variant="outline" loading={returnBusy === o.id}
                              onClick={() => handleReturn(o, { action: 'receive', outcome: 'accepted' }, 'Accept the inspection',
                                'Record that the piece passed a reasonable inspection. This unblocks the refund.')}>
                              Accept inspection
                            </Button>
                          )}
                          {ret.inspection_outcome !== 'rejected' && (
                            <Button size="sm" variant="ghost" loading={returnBusy === o.id}
                              onClick={() => handleReturn(o, { action: 'waive', waived_reason: 'unnecessary' }, 'Waive the return',
                                'Only on one of the documented grounds — unlawful, unsafe, impracticable or unnecessary. This records "unnecessary" and unblocks the refund without the piece coming back.')}>
                              Waive return
                            </Button>
                          )}
                        </>
                      );
                    })()}
                    {/* $750+ orders only, and only while it is unrecorded. */}
                    {o.signature_required && !o.signature_confirmed && (
                      <Button size="sm" variant="outline" loading={signing === o.id} onClick={() => handleRecordSignature(o)}>
                        Record signature confirmation
                      </Button>
                    )}
                    {o.signature_required && o.signature_confirmed && (
                      <span className="text-xs text-muted">Signature recorded</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!authorizeOrder}
        onClose={() => setAuthorizeOrder(null)}
        title="Require the piece back"
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            Terms of Sale §5: a refund may be conditioned on the artwork being returned. Once this
            is set the refund will not settle until the piece arrives and is inspected, or the
            return is waived.
          </p>
          <div>
            <label htmlFor="auth-reason" className="mb-1 block text-sm font-medium text-ink">Reason</label>
            <select
              id="auth-reason"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              value={authorizeReason}
              onChange={(e) => setAuthorizeReason(e.target.value as RefundReason)}
            >
              {REFUND_REASON_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Where should the buyer send it?</p>
            <p className="mt-0.5 text-xs text-muted">
              Shown only to this buyer, only after you authorise. Ask the artist for it — never use
              their public profile.
            </p>
            <div className="mt-2 space-y-2">
              <Input label="Name" value={authorizeAddress.name} onChange={(e) => setAuthorizeAddress({ ...authorizeAddress, name: e.target.value })} />
              <Input label="Street" value={authorizeAddress.street} onChange={(e) => setAuthorizeAddress({ ...authorizeAddress, street: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Input label="City" value={authorizeAddress.city} onChange={(e) => setAuthorizeAddress({ ...authorizeAddress, city: e.target.value })} />
                <Input label="State" value={authorizeAddress.state} onChange={(e) => setAuthorizeAddress({ ...authorizeAddress, state: e.target.value })} />
                <Input label="ZIP" value={authorizeAddress.zip} onChange={(e) => setAuthorizeAddress({ ...authorizeAddress, zip: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAuthorizeOrder(null)}>Cancel</Button>
            <Button
              loading={returnBusy === authorizeOrder?.id}
              disabled={!authorizeAddress.name || !authorizeAddress.street || !authorizeAddress.city || !authorizeAddress.state || !authorizeAddress.zip}
              onClick={async () => {
                const o = authorizeOrder;
                if (!o) return;
                await handleReturn(
                  o,
                  { action: 'authorize', reason: authorizeReason, required: true, return_address: authorizeAddress },
                  'Require a return',
                  'The buyer is told where to send the piece and has 7 calendar days to ship it. The refund will not settle until it arrives and is inspected, or you waive it.',
                );
                setAuthorizeOrder(null);
              }}
            >
              Authorise the return
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!refundModal}
        onClose={() => setRefundModal(null)}
        title="Refund this order"
      >
        {refundModal && (() => {
          const split = calculateRefundSplit(refundModal, refundReason);
          const fault = isFaultRefund(refundReason);
          const needsApproval = !fault && !refundModal.refund_approved_at;
          return (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Order #{refundModal.id.slice(0, 8)} · {formatPrice(refundModal.amount_cents)}
                {refundModal.refund_approved_at
                  ? ' · the artist approved a refund'
                  : ' · the artist has not approved a refund'}
              </p>

              <div>
                <label htmlFor="refund-reason" className="mb-1 block text-sm font-medium text-ink">
                  Why is this being refunded?
                </label>
                <select
                  id="refund-reason"
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value as RefundReason)}
                >
                  {REFUND_REASON_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg border border-line bg-sand/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Buyer receives</span>
                  <span className="font-medium text-ink">{formatPrice(split.refundAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Service fee</span>
                  <span className={fault ? 'text-ink' : 'text-muted'}>
                    {fault
                      ? `${formatPrice(refundModal.buyer_fee_cents)} returned`
                      : `${formatPrice(refundModal.buyer_fee_cents)} retained`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Artist payout reversed</span>
                  <span className="text-ink">{formatPrice(refundModal.artist_payout_cents)}</span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {fault
                    ? 'Fault refund: the whole charge goes back, service fee and tax included (Terms of Sale §2, Artist Agreement §8). Custom Canvas settles this whether or not the artist agrees.'
                    : 'Change of mind: the service fee and the tax on it are retained. This needs the artist to have approved it.'}
                </p>
              </div>

              {needsApproval && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">
                  The artist has not approved a change-of-mind refund, so this cannot be settled.
                  If the fault is ours or the artist&apos;s, pick that reason instead — those settle
                  without the artist.
                </p>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setRefundModal(null)}>Cancel</Button>
                <Button
                  variant="danger"
                  disabled={needsApproval}
                  loading={settling === refundModal.id}
                  onClick={handleSettleRefund}
                >
                  Refund {formatPrice(split.refundAmount)}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
