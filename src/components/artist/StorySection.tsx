'use client';

import type { ArtistProfile } from '@/types/artist';

interface StorySectionProps {
  artist: ArtistProfile;
}

export function StorySection({ artist }: StorySectionProps) {
  const hasStory = artist.story?.trim();
  const hasStatement = artist.artist_statement?.trim();
  const hasInfluences = artist.influences?.trim();

  if (!hasStory && !hasStatement && !hasInfluences) return null;

  return (
    <div className="space-y-6">
      {hasStory && (
        <div>
          <h2 className="mb-3 text-xl font-semibold text-ink">My Story</h2>
          <div className="max-w-prose whitespace-pre-line leading-relaxed text-ink/80">
            {artist.story}
          </div>
        </div>
      )}

      {/* A plain headed section, like Influences below it. It used to collapse
          into a full-width bordered box with a chevron whenever the artist
          also had a story — the only control of its kind on the page, sitting
          under prose, which read as an empty form field rather than something
          to expand. A tester called it "weird" and they were right. One code
          path now, and it matches the two sections either side of it. */}
      {hasStatement && (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-ink">Artist Statement</h3>
          <p className="max-w-prose whitespace-pre-line leading-relaxed text-ink/80">
            {artist.artist_statement}
          </p>
        </div>
      )}

      {hasInfluences && (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-ink">Influences</h3>
          <p className="text-muted">{artist.influences}</p>
        </div>
      )}
    </div>
  );
}
