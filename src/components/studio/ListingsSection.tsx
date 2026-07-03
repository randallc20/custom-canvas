'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { useArtistListings } from '@/hooks/useArtist';
import { useDeleteListing, useUpdateListing } from '@/hooks/useListings';
import { useArtistProfileId } from '@/hooks/useArtistProfileId';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { formatPrice } from '@/utils/formatPrice';

export function ListingsSection() {
  const { artistId, loading: loadingArtist } = useArtistProfileId();
  const { data: listings, isLoading } = useArtistListings(artistId);
  const deleteListing = useDeleteListing();
  const updateListing = useUpdateListing();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  if (loadingArtist || isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteListing.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div>
      {!listings || listings.length === 0 ? (
        <EmptyState title="No listings yet" description="Create your first listing to start sharing your art." action={<Link href="/listings/new"><Button>Create Listing</Button></Link>} />
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-sand">
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
                <p className="truncate font-medium text-ink">{listing.title}</p>
                <p className="text-sm text-muted">{formatPrice(listing.price_cents)}</p>
                <p className="text-xs text-muted">
                  {listing.view_count ?? 0} views · {listing.save_count ?? 0} saves
                </p>
              </div>
              <Badge variant={listing.status === 'available' ? 'success' : listing.status === 'draft' ? 'warning' : 'default'}>{listing.status}</Badge>
              <div className="flex gap-2">
                {listing.status === 'draft' && (
                  <Button
                    size="sm"
                    onClick={() => updateListing.mutate({ id: listing.id, data: { status: 'available' } })}
                  >
                    Publish
                  </Button>
                )}
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
          <p className="text-muted">
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
