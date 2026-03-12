'use client';

import { EmptyState } from '@/components/ui/EmptyState';

export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Orders</h1>
      <EmptyState title="No orders yet" description="Your purchase history will appear here." />
    </div>
  );
}
