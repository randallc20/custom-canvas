'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/utils/formatPrice';
import { supabase } from '@/lib/supabase';
import type { OrderStatus } from '@/types/order';

interface AdminOrder {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  artist_payout_cents: number;
  status: OrderStatus;
  created_at: string;
  buyer: { full_name: string | null; email: string } | null;
}

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

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, amount_cents, platform_fee_cents, artist_payout_cents, status, created_at, buyer:profiles!orders_buyer_id_fkey(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as AdminOrder[]);
        setLoading(false);
      });
  }, []);

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter((o) => o.status === statusFilter);

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount_cents, 0);
  const totalFees = orders.reduce((sum, o) => sum + o.platform_fee_cents, 0);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Orders ({orders.length})</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900">{formatPrice(totalRevenue)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Platform Fees</p>
          <p className="text-2xl font-bold text-terra">{formatPrice(totalFees)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Artist Payouts</p>
          <p className="text-2xl font-bold text-gray-900">{formatPrice(totalRevenue - totalFees)}</p>
        </div>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
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

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Order</th>
              <th className="px-4 py-3 font-medium text-gray-700">Buyer</th>
              <th className="px-4 py-3 font-medium text-gray-700">Amount</th>
              <th className="px-4 py-3 font-medium text-gray-700">Fee</th>
              <th className="px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 font-medium text-gray-700">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">#{o.id.slice(0, 8)}</td>
                <td className="px-4 py-3 text-gray-900">
                  {o.buyer?.full_name ?? o.buyer?.email ?? '—'}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{formatPrice(o.amount_cents)}</td>
                <td className="px-4 py-3 text-gray-500">{formatPrice(o.platform_fee_cents)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[o.status]}>{o.status}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
