'use client';

import Image from 'next/image';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { usePersonalPhotos, useInvalidateArtistContent } from '@/hooks/useArtistContent';
import { addPersonalPhotos, updatePersonalPhoto, deletePersonalPhoto } from '@/services/artistContent';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { swapDisplayOrder } from '@/utils/reorder';

const MAX_PHOTOS = 10;

interface PersonalPhotoUploaderProps {
  artistId: string;
}

export function PersonalPhotoUploader({ artistId }: PersonalPhotoUploaderProps) {
  const { data: photos = [] } = usePersonalPhotos(artistId);
  const invalidate = useInvalidateArtistContent();
  const { toast } = useToast();
  const confirm = useConfirm();

  const handleUpload = async (urls: string[]) => {
    await addPersonalPhotos(artistId, urls.slice(0, MAX_PHOTOS - photos.length), photos.length);
    invalidate(artistId, 'personal-photos');
    supabase.rpc('refresh_completeness_score', { p_artist_id: artistId });
  };

  const handleCaption = async (id: string, caption: string) => {
    try {
      await updatePersonalPhoto(id, { caption: caption || null });
    } catch {
      toast('Could not save caption', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Delete photo?', message: 'This photo will be permanently removed.', confirmLabel: 'Delete', destructive: true }))) return;
    await deletePersonalPhoto(id);
    invalidate(artistId, 'personal-photos');
    supabase.rpc('refresh_completeness_score', { p_artist_id: artistId });
  };

  const move = async (i: number, dir: -1 | 1) => {
    const moved = await swapDisplayOrder(photos, i, dir, (id, order) => updatePersonalPhoto(id, { display_order: order }));
    if (moved) invalidate(artistId, 'personal-photos');
  };

  return (
    <div className="space-y-4">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, i) => (
            <div key={photo.id} className="space-y-1">
              <div className="relative aspect-square">
                <Image
                  src={photo.image_url}
                  alt={photo.caption ?? 'Personal photo'}
                  fill
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="rounded-xl border border-line object-cover"
                />
                <div className="absolute right-1 top-1 flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier"
                    className="rounded-full bg-ink/60 px-1.5 text-xs text-cream disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label="Move later"
                    className="rounded-full bg-ink/60 px-1.5 text-xs text-cream disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => handleDelete(photo.id)} aria-label="Delete photo"
                    className="rounded-full bg-ink/60 px-1.5 text-xs text-cream hover:bg-red-600">✕</button>
                </div>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] text-cream">
                    Hero
                  </span>
                )}
              </div>
              <input
                defaultValue={photo.caption ?? ''}
                placeholder="Add a caption…"
                onBlur={(e) => handleCaption(photo.id, e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-muted/60 focus:border-terra focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
      {photos.length < MAX_PHOTOS && (
        <ImageUpload
          endpoint="/api/storage/artist-photo"
          maxFiles={MAX_PHOTOS - photos.length}
          maxSizeMB={5}
          label="Add photos of you and your studio"
          onUpload={handleUpload}
        />
      )}
      <p className="text-xs text-muted">{photos.length}/{MAX_PHOTOS} photos. The first photo is your hero shot.</p>
    </div>
  );
}
