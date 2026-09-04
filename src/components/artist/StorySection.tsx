'use client';

import type { ArtistProfile } from '@/types/artist';

/** The Artist Statement was removed from the public profile (owner decision,
 *  2026-09-04) and from the edit form with it. It read as a duplicate of
 *  "My Story" and, when both were present, collapsed into a bordered box with
 *  a chevron that looked like an empty form field. The COLUMN is untouched —
 *  existing statements are still in the database and can be brought back — but
 *  nothing writes to it and nothing shows it, which is the point: collecting
 *  text nobody reads is worse than not asking. */
interface StorySectionProps {
  artist: ArtistProfile;
}

export function StorySection({ artist }: StorySectionProps) {
  const hasStory = artist.story?.trim();
  const hasInfluences = artist.influences?.trim();

  if (!hasStory && !hasInfluences) return null;

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

      {hasInfluences && (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-ink">Influences</h3>
          <p className="text-muted">{artist.influences}</p>
        </div>
      )}
    </div>
  );
}
