'use client';

import { useState } from 'react';
import type { ArtistProfile } from '@/types/artist';

interface StorySectionProps {
  artist: ArtistProfile;
}

export function StorySection({ artist }: StorySectionProps) {
  const [statementOpen, setStatementOpen] = useState(false);
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

      {hasStatement && (
        hasStory ? (
          <div className="rounded-xl border border-line bg-surface">
            <button
              onClick={() => setStatementOpen((o) => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink"
            >
              Artist Statement
              <svg
                className={`h-4 w-4 text-muted transition-transform duration-200 ${statementOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statementOpen && (
              <p className="whitespace-pre-line border-t border-line px-4 py-3 text-sm text-muted">
                {artist.artist_statement}
              </p>
            )}
          </div>
        ) : (
          <div>
            <h3 className="mb-2 text-lg font-semibold text-ink">Artist Statement</h3>
            <p className="whitespace-pre-line text-muted">{artist.artist_statement}</p>
          </div>
        )
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
