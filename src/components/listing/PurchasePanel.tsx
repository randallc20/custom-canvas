'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Listing } from '@/types/listing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPrice, listingPriceLabel } from '@/utils/formatPrice';
import { calcSplit } from '@/utils/commissionCalc';
import { isPickupOnly } from '@/utils/fulfillment';
import { useAuth } from '@/context/AuthContext';
import { useFindOrCreateConversation } from '@/hooks/useConversations';

interface PurchasePanelProps {
  listing: Listing;
  artistProfileId?: string;
  fulfillmentPref?: string | null;
}

export function PurchasePanel({ listing, artistProfileId, fulfillmentPref }: PurchasePanelProps) {
  const { user } = useAuth();
  const router = useRouter();
  const findOrCreate = useFindOrCreateConversation();

  const pickup = isPickupOnly(fulfillmentPref);
  const shippingCents = pickup ? 0 : (listing.shipping_rate_cents ?? 0);
  const split = calcSplit(listing.price_cents, shippingCents);
  const hidePrice = listing.price_visible === false;
  const isOwnListing = !!user && !!artistProfileId && user.id === artistProfileId;

  const handleMessage = () => {
    if (!user || !artistProfileId) return;
    const priceText = listing.price_visible === false ? '' : ` — ${formatPrice(listing.price_cents)}`;
    const prefill = `Hi, I'm interested in "${listing.title}"${priceText}. Is this still available?`;
    findOrCreate.mutate(
      { userId: user.id, otherUserId: artistProfileId, contextType: 'listing', contextId: listing.id },
      { onSuccess: (conversation) => router.push(`/messages/${conversation.id}?prefill=${encodeURIComponent(prefill)}`) }
    );
  };

  const messageButton = isOwnListing ? null : user && artistProfileId ? (
    <Button
      variant={hidePrice ? 'primary' : 'outline'}
      className="w-full"
      onClick={handleMessage}
      loading={findOrCreate.isPending}
    >
      Message Artist
    </Button>
  ) : !user ? (
    <Link href="/login" className="block">
      <Button variant={hidePrice ? 'primary' : 'outline'} className="w-full">Message Artist</Button>
    </Link>
  ) : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-2xl font-bold text-ink">{listingPriceLabel(listing)}</span>
        <Badge variant={listing.status === 'available' ? 'success' : 'default'}>
          {listing.status === 'available' ? 'Available' : listing.status}
        </Badge>
      </div>

      {listing.status !== 'available' ? (
        <p className="text-sm text-muted">This piece is no longer available for purchase.</p>
      ) : isOwnListing ? (
        <p className="text-sm text-muted">This is your listing — buyers will see purchase options here.</p>
      ) : hidePrice ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Reach out to the artist to discuss pricing for this piece.
          </p>
          {messageButton}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1 text-sm text-muted">
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>
                {pickup
                  ? 'Local pickup — free'
                  : shippingCents > 0
                  ? formatPrice(shippingCents)
                  : 'Free'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Service fee at checkout</span>
              <span>{formatPrice(split.buyerFee)}</span>
            </div>
            <div className="flex justify-between font-medium text-ink">
              <span>Estimated total</span>
              <span>{formatPrice(split.buyerTotal)}</span>
            </div>
          </div>
          <Link href={`/checkout/${listing.id}`} className="block">
            <Button className="w-full">Buy Now</Button>
          </Link>
          {messageButton}
        </div>
      )}
    </div>
  );
}
