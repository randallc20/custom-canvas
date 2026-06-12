import type { ArtistVideo } from '@/types/artist';

interface VideoGalleryProps {
  videos: ArtistVideo[];
}

export function VideoGallery({ videos }: VideoGalleryProps) {
  if (videos.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {videos.map((video) => (
        <figure key={video.id}>
          {/* preload="none": no video bytes load until the poster is tapped */}
          <video
            controls
            playsInline
            preload="none"
            poster={video.thumbnail_url ?? undefined}
            src={video.video_url}
            className="aspect-video w-full rounded-xl border border-line bg-ink object-cover"
          />
          {(video.title || video.description) && (
            <figcaption className="mt-2">
              {video.title && <p className="text-sm font-medium text-ink">{video.title}</p>}
              {video.description && <p className="text-xs text-muted">{video.description}</p>}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
