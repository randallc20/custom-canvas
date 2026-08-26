'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useParams } from 'next/navigation';
import { useListing } from '@/hooks/useListings';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/utils/formatPrice';
import { calcSplit, BUYER_FEE_LABEL } from '@/utils/commissionCalc';
import { isPickupOnly } from '@/utils/fulfillment';
import { paymentsEnabled } from '@/utils/features';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';

export default function CheckoutPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['user', 'artist', 'gallery']}>
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

  if (!paymentsEnabled) {
    return (
      <p className="py-16 text-center text-muted">
        Purchasing isn&apos;t open quite yet — we&apos;re onboarding artists. Message the artist
        from the listing to be first in line when checkout goes live.
      </p>
    );
  }
  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  if (!listing) return <p className="py-16 text-center text-muted">Listing not found.</p>;
  if (listing.status !== 'available') {
    return <p className="py-16 text-center text-muted">This piece is no longer available.</p>;
  }
  if (listing.price_visible === false) {
    return (
      <p className="py-16 text-center text-muted">
        This piece is priced on request — message the artist from the listing page to discuss.
      </p>
    );
  }

  const isPickup = isPickupOnly(listing.artist?.fulfillment_pref);
  const shippingCents = isPickup ? 0 : (listing.shipping_rate_cents ?? 0);
  const split = calcSplit(listing.price_cents, shippingCents);

  const handleCheckout = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The delivery address is collected by Stripe Checkout, so that Stripe
        // Tax sources the jurisdiction from where the piece actually ships.
        body: JSON.stringify({ listingId }),
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
      captureException(err, { where: 'checkout.createSession' });
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Checkout</h1>
      <div className="mb-6 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="font-medium text-ink">{listing.title}</h2>
        <p className="text-sm text-muted">{listing.medium}</p>
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Price</span>
            <span>{formatPrice(listing.price_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Shipping</span>
            <span>{isPickup ? 'Local pickup — no shipping' : formatPrice(shippingCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{BUYER_FEE_LABEL}</span>
            <span>{formatPrice(split.buyerFee)}</span>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-medium">
            <span>Total</span>
            <span>{formatPrice(split.buyerTotal)}</span>
          </div>
          <p className="pt-1 text-xs text-muted">The service fee covers payment processing and applies to every order. Sales tax is calculated at payment.</p>
        </div>
      </div>
      {isPickup ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-sand/50 p-4 text-sm text-ink">
            <p className="font-medium">Local pickup</p>
            <p className="mt-1 text-muted">
              You&apos;ll coordinate pickup with the artist via Messages after purchase.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            By completing this purchase you agree to the{' '}
            <a href="/terms" target="_blank" className="font-medium text-terra underline">Terms of Sale</a>,
            including the artist-mediated refund policy and the non-refundable service fee.
            This charge will appear as <span className="font-medium text-ink">CUSTOM CANVAS</span> on
            your statement.
          </p>
          <Button className="w-full" onClick={handleCheckout} loading={submitting}>
            Pay {formatPrice(split.buyerTotal)}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-sand/50 p-4 text-sm text-ink">
            <p className="font-medium">Shipping</p>
            <p className="mt-1 text-muted">
              You&apos;ll enter your delivery address on the next step. Sales tax is
              calculated from where the piece ships.
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            By completing this purchase you agree to the{' '}
            <a href="/terms" target="_blank" className="font-medium text-terra underline">Terms of Sale</a>,
            including the artist-mediated refund policy and the non-refundable service fee.
            This charge will appear as <span className="font-medium text-ink">CUSTOM CANVAS</span> on
            your statement.
          </p>
          <Button className="w-full" onClick={handleCheckout} loading={submitting}>
            Pay {formatPrice(split.buyerTotal)}
          </Button>
        </div>
      )}
    </div>
  );
}
