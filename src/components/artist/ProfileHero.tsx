'use client';

import Image from 'next/image';
import { ArtistWithProfile } from '@/types/artist';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useIsFollowing, useFollowerCount, useToggleFollow } from '@/hooks/useFollows';

interface ProfileHeroProps {
  artist: ArtistWithProfile;
}

export function ProfileHero({ artist }: ProfileHeroProps) {
  const { user } = useAuth();
  const { data: isFollowing } = useIsFollowing(user?.id ?? '', artist.id);
  const { data: followerCount } = useFollowerCount(artist.id);
  const toggleFollow = useToggleFollow();

  const isOwnProfile = user?.id === artist.profile_id;
  const alignment = artist.bio_layout === 'center' ? 'text-center items-center' : 'text-left';

  const handleFollow = () => {
    if (!user) return;
    toggleFollow.mutate({
      profileId: user.id,
      artistId: artist.id,
      isCurrentlyFollowing: !!isFollowing,
    });
  };

  return (
    <div>
      <div className="relative h-48 w-full bg-gray-200 md:h-64" style={{ backgroundColor: artist.accent_color }}>
        {artist.banner_image_url && (
          <Image
            src={artist.banner_image_url}
            alt={`${artist.display_name}'s banner`}
            fill
            className="object-cover"
            priority
          />
        )}
      </div>
      <div className={`mx-auto flex max-w-7xl flex-col px-4 ${alignment}`}>
        <div className="-mt-12 mb-4">
          <div className="inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gray-300 text-2xl font-bold text-white shadow-lg">
            {artist.profile?.avatar_url ? (
              <Image
                src={artist.profile.avatar_url}
                alt={artist.display_name}
                width={96}
                height={96}
                className="h-full w-full object-cover"
              />
            ) : (
              artist.display_name[0].toUpperCase()
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{artist.display_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {artist.neighborhood && (
                <span className="text-sm text-gray-500">{artist.neighborhood}, {artist.city}</span>
              )}
              {artist.status && <Badge>{artist.status.replace(/_/g, ' ')}</Badge>}
              {artist.is_houston_verified && <Badge variant="verified">Houston Verified</Badge>}
              {artist.away_mode && (
                <Badge variant="warning">
                  Away{artist.away_until ? ` — back ${new Date(artist.away_until).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </Badge>
              )}
              {typeof followerCount === 'number' && (
                <span className="text-sm text-gray-500">
                  {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                </span>
              )}
            </div>
          </div>
          {user && !isOwnProfile && (
            <Button
              variant={isFollowing ? 'outline' : 'primary'}
              size="sm"
              onClick={handleFollow}
              loading={toggleFollow.isPending}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>
        {artist.primary_mediums && artist.primary_mediums.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {artist.primary_mediums.map((medium) => (
              <span key={medium} className="rounded-full bg-sand px-2.5 py-0.5 text-xs font-medium text-muted">
                {medium}
              </span>
            ))}
          </div>
        )}
        {artist.bio && <p className="mt-3 max-w-2xl text-gray-600">{artist.bio}</p>}
      </div>
    </div>
  );
}
