'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useListing } from '@/hooks/useListings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [shipping, setShipping] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!listing) return <p className="py-16 text-center text-gray-500">Listing not found.</p>;
  if (listing.status !== 'available') {
    return <p className="py-16 text-center text-gray-500">This piece is no longer available.</p>;
  }

  const { platformFeeCents } = calculateCommission(listing.price_cents);
  const total = listing.price_cents;

  const isShippingValid = shipping.street.trim() && shipping.city.trim() && shipping.state.trim() && shipping.zip.trim();

  const handleCheckout = async () => {
    if (!user || !isShippingValid) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          shipping,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      setSubmitting(false);
    }
  };

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
        <Input
          label="Street Address"
          placeholder="123 Main St"
          value={shipping.street}
          onChange={(e) => setShipping((s) => ({ ...s, street: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="City"
            placeholder="Houston"
            value={shipping.city}
            onChange={(e) => setShipping((s) => ({ ...s, city: e.target.value }))}
          />
          <Input
            label="State"
            placeholder="TX"
            value={shipping.state}
            onChange={(e) => setShipping((s) => ({ ...s, state: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="ZIP Code"
            placeholder="77001"
            value={shipping.zip}
            onChange={(e) => setShipping((s) => ({ ...s, zip: e.target.value }))}
          />
          <Input label="Country" value="US" disabled />
        </div>
        <Button
          className="w-full"
          onClick={handleCheckout}
          loading={submitting}
          disabled={!isShippingValid}
        >
          Pay {formatPrice(total)}
        </Button>
      </div>
    </div>
  );
}
