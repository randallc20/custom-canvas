import Link from 'next/link';
import Image from 'next/image';
import type { ArtistProfile } from '@/types/artist';

interface ProfileCardProps {
  /** The gallery page embeds the artist's profile row; the avatar lives there. */
  artist: ArtistProfile & { profile?: { avatar_url: string | null } | null };
}

export function ProfileCard({ artist }: ProfileCardProps) {
  // The banner is the wide header image, not a face — showing it here gave the
  // same artist a different picture on every surface.
  const avatarUrl = artist.profile?.avatar_url ?? null;
  return (
    <Link
      href={`/artist/${artist.slug}`}
      className="group block rounded-xl border border-line p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={artist.display_name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: artist.accent_color || '#E8704A' }}
          >
            {artist.display_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink group-hover:text-terraText">
            {artist.display_name}
          </p>
          {artist.neighborhood && (
            <p className="truncate text-sm text-muted">{[artist.neighborhood, artist.city].filter(Boolean).join(', ')}</p>
          )}
        </div>
      </div>
      {artist.bio && (
        <p className="mt-2 line-clamp-2 text-sm text-muted">{artist.bio}</p>
      )}
    </Link>
  );
}
