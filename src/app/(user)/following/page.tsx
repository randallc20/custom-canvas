'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useFollowedArtists } from '@/hooks/useFollows';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

export default function FollowingPage() {
  const { user } = useAuth();
  const { data: artists, isLoading } = useFollowedArtists(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Following</h1>
      {!artists || artists.length === 0 ? (
        <EmptyState title="Not following anyone" description="Follow artists to see their work here." />
      ) : (
        <div className="space-y-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              href={`/artist/${artist.slug}`}
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <Avatar src={artist.banner_image_url} alt={artist.display_name} size="md" />
              <div>
                <p className="font-medium text-gray-900">{artist.display_name}</p>
                {artist.neighborhood ? (
                  <p className="text-sm text-gray-500">{artist.neighborhood}, {artist.city}</p>
                ) : (
                  <p className="text-sm text-gray-500">{artist.city}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
