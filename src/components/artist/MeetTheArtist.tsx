'use client';

import { useState } from 'react';
import Image from 'next/image';
import { VideoGallery } from '@/components/artist/VideoGallery';
import type { ArtistPersonalPhoto, ArtistVideo } from '@/types/artist';

interface MeetTheArtistProps {
  displayName: string;
  photos: ArtistPersonalPhoto[];
  videos: ArtistVideo[];
}

export function MeetTheArtist({ displayName, photos, videos }: MeetTheArtistProps) {
  const [lightbox, setLightbox] = useState<ArtistPersonalPhoto | null>(null);

  if (photos.length === 0 && videos.length === 0) return null;

  const [hero, ...rest] = photos;

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-ink">Meet the Artist</h2>

      {hero && (
        <figure className="mb-4">
          <button onClick={() => setLightbox(hero)} className="block w-full">
            <Image
              src={hero.image_url}
              alt={hero.caption ?? `${displayName} in the studio`}
              width={1200}
              height={700}
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="max-h-[28rem] w-full rounded-xl border border-line object-cover"
            />
          </button>
          {hero.caption && <figcaption className="mt-2 text-sm text-muted">{hero.caption}</figcaption>}
        </figure>
      )}

      {rest.length > 0 && (
        <div className="mb-6 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible">
          {rest.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setLightbox(photo)}
              className="group relative h-32 w-32 flex-shrink-0 sm:h-auto sm:w-auto sm:aspect-square"
              title={photo.caption ?? undefined}
            >
              <Image
                src={photo.image_url}
                alt={photo.caption ?? `${displayName} photo`}
                fill
                sizes="(max-width: 640px) 128px, 16vw"
                className="rounded-xl border border-line object-cover"
              />
              {photo.caption && (
                <span className="absolute inset-x-0 bottom-0 hidden rounded-b-xl bg-ink/70 px-2 py-1 text-left text-xs text-cream group-hover:block">
                  {photo.caption}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <VideoGallery videos={videos} />

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <figure className="max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox shows the original at natural size */}
            <img src={lightbox.image_url} alt={lightbox.caption ?? ''} className="max-h-[80vh] w-auto rounded-xl" />
            {lightbox.caption && <figcaption className="mt-2 text-center text-sm text-cream">{lightbox.caption}</figcaption>}
          </figure>
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 text-cream/80 transition-colors hover:text-cream"
            aria-label="Close"
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
