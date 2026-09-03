'use client';

import Link from 'next/link';
import { formatDateOnly } from '@/utils/formatDateOnly';
import { captureException } from '@/lib/sentry';
import { useRouter } from 'next/navigation';
import { Listing } from '@/types/listing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPrice, listingPriceLabel } from '@/utils/formatPrice';
import { calcSplit, BUYER_FEE_LABEL } from '@/utils/commissionCalc';
import { DEFAULT_FULFILLMENT_WINDOW_DAYS } from '@/utils/evaluateProtection';
import { isPickupOnly } from '@/utils/fulfillment';
import { paymentsEnabled } from '@/utils/features';
import { useAuth } from '@/context/AuthContext';
import { useFindOrCreateConversation } from '@/hooks/useConversations';
import { useToast } from '@/components/ui/Toast';

interface PurchasePanelProps {
  listing: Listing;
  artistProfileId?: string;
  /** Seller of record (L3). Terms of Sale §1 and Artist Agreement §1: the
   *  artist is the seller, and "the artist identified in the applicable
   *  listing" has to actually identify someone. The name was on the page as
   *  authorship; this is the same name in its legal role. */
  artistName?: string | null;
  fulfillmentPref?: string | null;
  awayMode?: boolean;
  awayUntil?: string | null;
}

export function PurchasePanel({ listing, artistProfileId, artistName, fulfillmentPref, awayMode, awayUntil }: PurchasePanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const findOrCreate = useFindOrCreateConversation();

  const pickup = isPickupOnly(fulfillmentPref);
  const awayDate = awayUntil ? formatDateOnly(awayUntil) : null;
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
      {
        onSuccess: (conversation) => router.push(`/messages/${conversation.id}?prefill=${encodeURIComponent(prefill)}`),
        // Without this a failed create left the button doing nothing at all.
        onError: (err) => { captureException(err, { where: 'PurchasePanel.messageArtist' }); toast('Could not open the conversation — please try again.', 'error'); },
      }
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
      <div className="mb-1 flex items-center justify-between">
        <span className="text-2xl font-bold text-ink">{listingPriceLabel(listing)}</span>
        <Badge variant={listing.status === 'available' ? 'success' : 'default'}>
          {listing.status === 'available' ? 'Available' : listing.status}
        </Badge>
      </div>
      {artistName && (
        <p className="mb-4 text-xs text-muted">
          Sold by <span className="font-medium text-ink">{artistName}</span> · Custom Canvas
          facilitates payment
        </p>
      )}

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
      ) : awayMode ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-sand/50 p-3 text-sm text-ink">
            This artist is away{awayDate ? ` — back ${awayDate}` : ''}. Save this piece to revisit later.
          </div>
          {messageButton}
        </div>
      ) : !paymentsEnabled ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-sand/50 p-3 text-sm text-ink">
            <p className="font-medium">Purchasing opens soon</p>
            <p className="mt-1 text-muted">
              We&apos;re onboarding artists right now. Follow this artist or message them to be
              first in line when checkout goes live.
            </p>
          </div>
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
              <span>{BUYER_FEE_LABEL}</span>
              <span>{formatPrice(split.buyerFee)}</span>
            </div>
            <div className="flex justify-between font-medium text-ink">
              <span>Estimated total</span>
              <span>{formatPrice(split.buyerTotal)}</span>
            </div>
            {!pickup && (
              <p className="pt-1 text-xs">
                Ships within{' '}
                <span className="font-medium text-ink">
                  {DEFAULT_FULFILLMENT_WINDOW_DAYS} business days
                </span>{' '}
                of purchase, with tracking.
              </p>
            )}
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
