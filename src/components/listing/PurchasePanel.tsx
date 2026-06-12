'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Listing } from '@/types/listing';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatPrice } from '@/utils/formatPrice';
import { useAuth } from '@/context/AuthContext';
import { useFindOrCreateConversation } from '@/hooks/useConversations';

interface PurchasePanelProps {
  listing: Listing;
  artistSlug: string;
  artistProfileId?: string;
}

export function PurchasePanel({ listing, artistProfileId }: PurchasePanelProps) {
  const { user } = useAuth();
  const router = useRouter();
  const findOrCreate = useFindOrCreateConversation();

  const handleMessage = () => {
    if (!user || !artistProfileId) return;
    findOrCreate.mutate(
      { userId: user.id, otherUserId: artistProfileId, contextType: 'listing', contextId: listing.id },
      { onSuccess: (conversation) => router.push(`/messages/${conversation.id}`) }
    );
  };

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
          {user && artistProfileId && user.id !== artistProfileId ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleMessage}
              loading={findOrCreate.isPending}
            >
              Message Artist
            </Button>
          ) : !user ? (
            <Link href="/login" className="block">
              <Button variant="outline" className="w-full">Message Artist</Button>
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-gray-500">This piece is no longer available for purchase.</p>
      )}
    </div>
  );
}
