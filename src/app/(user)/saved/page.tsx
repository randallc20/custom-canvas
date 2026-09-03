'use client';

import { useAuth } from '@/context/AuthContext';
import { useSavedListings } from '@/hooks/useSaved';
import { FeedCard } from '@/components/feed/FeedCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { QueryError } from '@/components/ui/QueryError';

export default function SavedPage() {
  const { user } = useAuth();
  const { data: listings, isLoading, isError, refetch, isFetching } = useSavedListings(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Saved Art</h1>
      {isError ? (
        <QueryError message="We couldn't load your saved art." onRetry={() => refetch()} retrying={isFetching} />
      ) : !listings || listings.length === 0 ? (
        <EmptyState title="No saved art" description="Heart pieces you love to save them here." />
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {listings.map((listing) => (
            <div key={listing.id} className="mb-4 break-inside-avoid">
              <FeedCard listing={listing} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
