'use client';

import Image from 'next/image';
import { VideoUpload } from '@/components/upload/VideoUpload';
import { useVideos, useInvalidateArtistContent } from '@/hooks/useArtistContent';
import { addVideo, updateVideo, deleteVideo } from '@/services/artistContent';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { swapDisplayOrder } from '@/utils/reorder';

const MAX_VIDEOS = 5;

interface VideoUploaderSectionProps {
  artistId: string;
}

export function VideoUploaderSection({ artistId }: VideoUploaderSectionProps) {
  const { data: videos = [] } = useVideos(artistId);
  const invalidate = useInvalidateArtistContent();
  const { toast } = useToast();
  const confirm = useConfirm();

  const handleUpload = async ({ videoUrl, thumbnailUrl }: { videoUrl: string; thumbnailUrl: string | null }) => {
    await addVideo(artistId, { video_url: videoUrl, thumbnail_url: thumbnailUrl, display_order: videos.length });
    invalidate(artistId, 'artist-videos');
  };

  const handleMeta = async (id: string, field: 'title' | 'description', value: string) => {
    try {
      await updateVideo(id, { [field]: value || null });
    } catch {
      toast('Could not save', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: 'Delete video?', message: 'This video will be permanently removed.', confirmLabel: 'Delete', destructive: true }))) return;
    await deleteVideo(id);
    invalidate(artistId, 'artist-videos');
  };

  const move = async (i: number, dir: -1 | 1) => {
    const moved = await swapDisplayOrder(videos, i, dir, (id, order) => updateVideo(id, { display_order: order }));
    if (moved) invalidate(artistId, 'artist-videos');
  };

  return (
    <div className="space-y-4">
      {videos.map((video, i) => (
        <div key={video.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
          <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-lg bg-ink">
            {video.thumbnail_url ? (
              <Image src={video.thumbnail_url} alt={video.title ?? 'Video thumbnail'} fill sizes="128px" className="object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-cream/60">video</div>
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <input
              defaultValue={video.title ?? ''}
              placeholder="Title"
              onBlur={(e) => handleMeta(video.id, 'title', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm text-ink placeholder:text-muted/60 focus:border-terra focus:outline-none"
            />
            <input
              defaultValue={video.description ?? ''}
              placeholder="Description"
              onBlur={(e) => handleMeta(video.id, 'description', e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink placeholder:text-muted/60 focus:border-terra focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
              className="rounded p-0.5 text-xs text-muted hover:text-ink disabled:opacity-30">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === videos.length - 1} aria-label="Move down"
              className="rounded p-0.5 text-xs text-muted hover:text-ink disabled:opacity-30">↓</button>
            <button type="button" onClick={() => handleDelete(video.id)} aria-label="Delete video"
              className="rounded p-0.5 text-xs text-muted hover:text-red-600">✕</button>
          </div>
        </div>
      ))}
      {videos.length < MAX_VIDEOS && (
        <VideoUpload endpoint="/api/storage/artist-video" maxSizeMB={200} onUpload={handleUpload} />
      )}
      <p className="text-xs text-muted">{videos.length}/{MAX_VIDEOS} videos, max 200MB each.</p>
    </div>
  );
}
