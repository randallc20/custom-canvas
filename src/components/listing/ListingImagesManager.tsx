'use client';

import { useQueryClient } from '@tanstack/react-query';
import { captureException } from '@/lib/sentry';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { ImageThumbGrid } from '@/components/upload/ImageThumbGrid';
import { addListingImages, updateListingImage, deleteListingImage } from '@/services/listings';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { swapDisplayOrder } from '@/utils/reorder';
import { ListingImage } from '@/types/listing';

export const MAX_LISTING_IMAGES = 8;

interface ListingImagesManagerProps {
  listingId: string;
  images: ListingImage[];
}

export function ListingImagesManager({ listingId, images }: ListingImagesManagerProps) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();
  const sorted = [...images].sort((a, b) => a.display_order - b.display_order);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
    queryClient.invalidateQueries({ queryKey: ['listings'] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  // Keeps display_order dense (0..n-1) and is_primary pinned to the first
  // image, so feed cards (is_primary) and the carousel (display_order) agree.
  const renumber = async (imgs: ListingImage[]) => {
    await Promise.all(
      imgs.map((img, i) =>
        img.display_order !== i || img.is_primary !== (i === 0)
          ? updateListingImage(img.id, { display_order: i, is_primary: i === 0 })
          : Promise.resolve()
      )
    );
  };

  const handleUpload = async (urls: string[]) => {
    try {
      await addListingImages(listingId, urls.slice(0, MAX_LISTING_IMAGES - sorted.length), sorted.length);
    } catch (err) {
      captureException(err, { where: 'ListingImagesManager.upload' });
      toast('Could not save the uploaded images', 'error');
      return;
    }
    invalidate();
  };

  const handleMove = async (i: number, dir: -1 | 1) => {
    try {
      const moved = await swapDisplayOrder(sorted, i, dir, (id, order) =>
        updateListingImage(id, { display_order: order, is_primary: order === 0 })
      );
      if (moved) invalidate();
    } catch (err) {
      captureException(err, { where: 'ListingImagesManager.reorder' });
      toast('Could not reorder the images', 'error');
    }
  };

  const handleRemove = async (i: number) => {
    if (!(await confirm({ title: 'Remove image?', message: 'This image will be removed from the listing.', confirmLabel: 'Remove', destructive: true }))) return;
    try {
      await deleteListingImage(sorted[i].id);
      await renumber(sorted.filter((_, j) => j !== i));
    } catch (err) {
      captureException(err, { where: 'ListingImagesManager.remove' });
      toast('Could not remove the image', 'error');
      return;
    }
    invalidate();
  };

  return (
    <fieldset className="space-y-4 rounded-xl border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">Images</legend>
      <ImageThumbGrid
        items={sorted.map((img) => ({ key: img.id, url: img.image_url }))}
        onMove={handleMove}
        onRemove={handleRemove}
      />
      {sorted.length < MAX_LISTING_IMAGES && (
        <ImageUpload
          endpoint="/api/storage/listing-image"
          maxFiles={MAX_LISTING_IMAGES - sorted.length}
          maxSizeMB={5}
          label="Add photos of this piece"
          onUpload={handleUpload}
        />
      )}
      <p className="text-xs text-muted">{sorted.length}/{MAX_LISTING_IMAGES} images. The first image is the cover shown in the feed.</p>
    </fieldset>
  );
}
