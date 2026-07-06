import type { ArtistProfile } from '@/types/artist';

interface ProfileBioProps {
  artist: ArtistProfile;
}

export function ProfileBio({ artist }: ProfileBioProps) {
  const hasStatement = artist.artist_statement?.trim();
  const hasInfluences = artist.influences?.trim();

  if (!hasStatement && !hasInfluences) return null;

  return (
    <div className="space-y-6">
      {hasStatement && (
        <div>
          <h3 className="mb-2 text-lg font-semibold text-ink">Artist Statement</h3>
          <p className="whitespace-pre-line text-muted">{artist.artist_statement}</p>
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
