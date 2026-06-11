'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useArtistListings } from '@/hooks/useArtist';
import { useDeleteListing } from '@/hooks/useListings';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatPrice } from '@/utils/formatPrice';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function ArtistListingsPage() {
  const { user } = useAuth();
  const [artistId, setArtistId] = useState('');
  const { data: listings, isLoading } = useArtistListings(artistId);
  const deleteListing = useDeleteListing();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id').eq('profile_id', user.id).single()
      .then(({ data }) => { if (data) setArtistId(data.id); });
  }, [user]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteListing.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
        <Link href="/listings/new"><Button>New Listing</Button></Link>
      </div>

      {!listings || listings.length === 0 ? (
        <EmptyState title="No listings yet" description="Create your first listing to start sharing your art." action={<Link href="/listings/new"><Button>Create Listing</Button></Link>} />
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="flex items-center gap-4 rounded-lg border border-gray-200 p-4">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                {listing.images?.[0] && (
                  <Image
                    src={listing.images[0].image_url}
                    alt={listing.title}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{listing.title}</p>
                <p className="text-sm text-gray-500">{formatPrice(listing.price_cents)}</p>
              </div>
              <Badge variant={listing.status === 'available' ? 'success' : 'default'}>{listing.status}</Badge>
              <div className="flex gap-2">
                <Link href={`/listings/${listing.id}/edit`}><Button variant="outline" size="sm">Edit</Button></Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteTarget({ id: listing.id, title: listing.title })}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!deleteTarget} title="Delete Listing" onClose={() => setDeleteTarget(null)}>
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete <strong>{deleteTarget?.title}</strong>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
