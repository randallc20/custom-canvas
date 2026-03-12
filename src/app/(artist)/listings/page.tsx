'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useArtistListings } from '@/hooks/useArtist';
import { useDeleteListing } from '@/hooks/useListings';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatPrice } from '@/utils/formatPrice';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ArtistListingsPage() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');
  const { data: listings, isLoading } = useArtistListings(artistId);
  const deleteListing = useDeleteListing();

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
        <Link href="/listings/new"><Button>New Listing</Button></Link>
      </div>

      {!listings || listings.length === 0 ? (
        <EmptyState title="No listings yet" description="Create your first listing to start selling." action={<Link href="/listings/new"><Button>Create Listing</Button></Link>} />
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
              <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                {listing.images?.[0] && <img src={listing.images[0].image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{listing.title}</p>
                <p className="text-sm text-gray-500">{formatPrice(listing.price_cents)}</p>
              </div>
              <Badge variant={listing.status === 'available' ? 'success' : 'default'}>{listing.status}</Badge>
              <div className="flex gap-2">
                <Link href={`/listings/${listing.id}/edit`}><Button variant="outline" size="sm">Edit</Button></Link>
                <Button variant="danger" size="sm" onClick={() => deleteListing.mutate(listing.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
