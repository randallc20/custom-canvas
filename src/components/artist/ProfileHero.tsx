'use client';

import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { formatDateOnly } from '@/utils/formatDateOnly';
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
      {/* Nothing is cropped, whatever the artist uploads.
          The first attempt at this matched the box to the uploader's advice
          ("1440x400 works best") and still cut a 1511x1007 photo in half,
          because artists upload photographs, not banner strips — measured on
          the live page: a 400px-tall box showing 40% of the image. Any fixed
          ratio has that failure, and there is no crop tool to make the artist
          choose which 40%.
          So: the image is CONTAINED, and a blurred copy of it fills the space
          either side. The whole photo is always visible, a correctly-sized
          1440x400 banner is unchanged (contain and cover agree at that ratio),
          and the fill is drawn from the image itself so it never fights the
          artist's colours.
          The tall box applies only when there IS a banner. Most artists have
          none, and giving them a 400px slab of flat accent colour above the
          fold was a worse page than the one being fixed — an empty header is
          not worth a third of the screen. Without an image it keeps the
          original height. */}
      <div
        className={`relative w-full overflow-hidden bg-sand ${
          artist.banner_image_url ? 'aspect-[36/10] max-h-[25rem]' : 'h-48 md:h-64'
        }`}
        style={{ backgroundColor: artist.accent_color ?? '#E8704A' }}
      >
        {artist.banner_image_url && (
          <>
            <Image
              src={artist.banner_image_url}
              alt=""
              aria-hidden
              fill
              sizes="100vw"
              className="scale-110 object-cover blur-2xl"
              priority
            />
            <Image
              src={artist.banner_image_url}
              alt={`${artist.display_name}'s banner`}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </>
        )}
      </div>
      <div className={`mx-auto flex max-w-7xl flex-col px-4 ${alignment}`}>
        {/* `relative z-10`: the banner above is positioned, so without a
            stacking context of its own this avatar paints UNDERNEATH it and
            loses its top half to the banner's bottom edge. */}
        <div className="relative z-10 -mt-12 mb-4">
          {/* The shared Avatar, not a hand-rolled next/image: it falls back to
              initials when the file has gone missing from storage. A broken
              <img> renders as its alt text, so a deleted avatar used to show
              the artist's whole name sprawling out of the circle. */}
          <div className="inline-flex overflow-hidden rounded-full border-4 border-white shadow-lg">
            <Avatar src={artist.profile?.avatar_url} alt={artist.display_name} size="2xl" />
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{artist.display_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {artist.neighborhood && (
                <span className="text-sm text-muted">{artist.neighborhood}, {artist.city}</span>
              )}
              {artist.status && <Badge>{artist.status.replace(/_/g, ' ')}</Badge>}
              {artist.is_houston_verified && <Badge variant="verified">Local Verified</Badge>}
              {artist.away_mode && (
                <Badge variant="warning">
                  Away{artist.away_until ? ` — back ${formatDateOnly(artist.away_until)}` : ''}
                </Badge>
              )}
              {typeof followerCount === 'number' && (
                <span className="text-sm text-muted">
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
        {artist.bio && <p className="mt-3 max-w-2xl text-muted">{artist.bio}</p>}
      </div>
    </div>
  );
}
