'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/AuthContext';
import { useIsFollowing, useToggleFollow } from '@/hooks/useFollows';
import type { ArtistProfile } from '@/types/artist';

interface ArtistBrowseCardProps {
  artist: ArtistProfile & { avatar_url: string | null };
}

export function ArtistBrowseCard({ artist }: ArtistBrowseCardProps) {
  const { user } = useAuth();
  const { data: isFollowing } = useIsFollowing(user?.id ?? '', artist.id);
  const toggleFollow = useToggleFollow();

  const isOwn = user?.id === artist.profile_id;

  const handleFollow = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) return;
    toggleFollow.mutate({ profileId: user.id, artistId: artist.id, isCurrentlyFollowing: !!isFollowing });
  };

  return (
    <Link
      href={`/artist/${artist.slug}`}
      className="card-hover group block overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="h-20 w-full" style={{ backgroundColor: artist.accent_color || '#E8704A' }}>
        {artist.banner_image_url && (
          <Image
            src={artist.banner_image_url}
            alt={`${artist.display_name} banner`}
            width={400}
            height={80}
            sizes="(max-width: 640px) 100vw, 33vw"
            className="h-20 w-full object-cover"
          />
        )}
      </div>
      <div className="px-4 pb-4">
        <div className="-mt-6 mb-2">
          <Avatar src={artist.avatar_url} alt={artist.display_name} size="lg" className="border-2 border-surface" />
        </div>
        <p className="truncate font-medium text-ink group-hover:text-terra">{artist.display_name}</p>
        <p className="truncate text-sm text-muted">
          {[artist.city, artist.neighborhood].filter(Boolean).join(' · ') || 'Local artist'}
        </p>
        {user && !isOwn && (
          <Button
            variant={isFollowing ? 'outline' : 'primary'}
            size="sm"
            className="mt-3 w-full"
            onClick={handleFollow}
            loading={toggleFollow.isPending}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>
    </Link>
  );
}
