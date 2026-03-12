'use client';

import Link from 'next/link';
import { Listing } from '@/types/listing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/utils/formatPrice';

interface PurchasePanelProps {
  listing: Listing;
  artistSlug: string;
}

export function PurchasePanel({ listing, artistSlug }: PurchasePanelProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-2xl font-bold text-gray-900">{formatPrice(listing.price_cents)}</span>
        <Badge variant={listing.status === 'available' ? 'success' : 'default'}>
          {listing.status === 'available' ? 'Available' : listing.status}
        </Badge>
      </div>

      {listing.status === 'available' ? (
        <div className="space-y-3">
          <Link href={`/checkout/${listing.id}`} className="block">
            <Button className="w-full">Buy Now</Button>
          </Link>
          <Link href={`/messages?context=listing&contextId=${listing.id}&artist=${artistSlug}`} className="block">
            <Button variant="outline" className="w-full">Message Artist</Button>
          </Link>
        </div>
      ) : (
        <p className="text-sm text-gray-500">This piece is no longer available for purchase.</p>
      )}
    </div>
  );
}
