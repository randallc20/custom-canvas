'use client';

import { useParams } from 'next/navigation';
import { useListing } from '@/hooks/useListings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { formatPrice } from '@/utils/formatPrice';
import { calculateCommission } from '@/utils/commissionCalc';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';

export default function CheckoutPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['user', 'gallery']}>
        <CheckoutContent />
      </AuthGuard>
    </PageShell>
  );
}

function CheckoutContent() {
  const { listingId } = useParams<{ listingId: string }>();
  const { data: listing, isLoading } = useListing(listingId);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!listing) return <p className="py-16 text-center text-gray-500">Listing not found.</p>;

  const { platformFeeCents } = calculateCommission(listing.price_cents);
  const total = listing.price_cents;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Checkout</h1>
      <div className="mb-6 rounded-lg border border-gray-200 p-4">
        <h2 className="font-medium text-gray-900">{listing.title}</h2>
        <p className="text-sm text-gray-500">{listing.medium}</p>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatPrice(listing.price_cents)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Platform fee (15%)</span><span>{formatPrice(platformFeeCents)}</span></div>
          <div className="flex justify-between border-t pt-1 font-medium"><span>Total</span><span>{formatPrice(total)}</span></div>
        </div>
      </div>
      <div className="space-y-4">
        <h2 className="font-medium text-gray-900">Shipping Address</h2>
        <Input label="Street Address" placeholder="123 Main St" />
        <div className="grid grid-cols-2 gap-4">
          <Input label="City" placeholder="Houston" />
          <Input label="State" placeholder="TX" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="ZIP Code" placeholder="77001" />
          <Input label="Country" value="US" disabled />
        </div>
        <Button className="w-full">Pay {formatPrice(total)}</Button>
      </div>
    </div>
  );
}
