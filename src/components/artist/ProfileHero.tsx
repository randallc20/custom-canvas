import { ArtistWithProfile } from '@/types/artist';
import { Badge } from '@/components/ui/Badge';

interface ProfileHeroProps {
  artist: ArtistWithProfile;
}

export function ProfileHero({ artist }: ProfileHeroProps) {
  const alignment = artist.bio_layout === 'center' ? 'text-center' : artist.bio_layout === 'minimal' ? 'text-left' : 'text-left';

  return (
    <div>
      <div className="relative h-48 w-full bg-gray-200 md:h-64" style={{ backgroundColor: artist.accent_color }}>
        {artist.banner_image_url && (
          <img src={artist.banner_image_url} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className={`mx-auto max-w-7xl px-4 ${alignment}`}>
        <div className="-mt-12 mb-4">
          <div className="inline-flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gray-300 text-2xl font-bold text-white shadow-lg">
            {artist.profile?.avatar_url ? (
              <img src={artist.profile.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              artist.display_name[0].toUpperCase()
            )}
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{artist.display_name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {artist.neighborhood && <span className="text-sm text-gray-500">{artist.neighborhood}, {artist.city}</span>}
          {artist.status && <Badge>{artist.status.replace('_', ' ')}</Badge>}
          {artist.is_houston_verified && <Badge variant="verified">Houston Verified</Badge>}
        </div>
        {artist.bio && <p className="mt-3 max-w-2xl text-gray-600">{artist.bio}</p>}
      </div>
    </div>
  );
}
