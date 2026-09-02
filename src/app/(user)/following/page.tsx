'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useFollowedArtists } from '@/hooks/useFollows';
import { Avatar } from '@/components/ui/Avatar';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryError } from '@/components/ui/QueryError';

export default function FollowingPage() {
  const { user } = useAuth();
  const { data: artists, isLoading, isError, refetch, isFetching } = useFollowedArtists(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Following</h1>
      {isError ? (
        <QueryError message="We couldn't load the artists you follow." onRetry={() => refetch()} retrying={isFetching} />
      ) : !artists || artists.length === 0 ? (
        <EmptyState title="Not following anyone" description="Follow artists to see their work here." />
      ) : (
        <div className="space-y-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              href={`/artist/${artist.slug}`}
              className="flex items-center gap-3 rounded-lg border border-line p-4 transition-colors hover:border-line hover:bg-sand/50"
            >
              {/* The avatar, not the banner — the same artist showed a
                  different picture here than on their own page. */}
              <Avatar src={artist.profile?.avatar_url ?? null} alt={artist.display_name} size="md" />
              <div>
                <p className="font-medium text-ink">{artist.display_name}</p>
                {artist.neighborhood ? (
                  <p className="text-sm text-muted">{artist.neighborhood}, {artist.city}</p>
                ) : (
                  <p className="text-sm text-muted">{artist.city}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
