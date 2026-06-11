import Link from 'next/link';
import Image from 'next/image';
import type { ArtistProfile } from '@/types/artist';

interface ProfileCardProps {
  artist: ArtistProfile;
}

export function ProfileCard({ artist }: ProfileCardProps) {
  return (
    <Link
      href={`/artist/${artist.slug}`}
      className="group block rounded-xl border border-gray-200 p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        {artist.banner_image_url ? (
          <Image
            src={artist.banner_image_url}
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
          <p className="truncate font-medium text-gray-900 group-hover:text-[#E8704A]">
            {artist.display_name}
          </p>
          {artist.neighborhood && (
            <p className="truncate text-sm text-gray-500">{artist.neighborhood}, {artist.city || 'Houston'}</p>
          )}
        </div>
      </div>
      {artist.bio && (
        <p className="mt-2 line-clamp-2 text-sm text-gray-500">{artist.bio}</p>
      )}
    </Link>
  );
}
