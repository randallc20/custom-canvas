'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useArtist } from '@/hooks/useArtist';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';

export default function ArtistDashboardPage() {
  const { user } = useAuth();
  const { data: artist, isLoading } = useArtist(user?.id ?? '');

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Artist Dashboard</h1>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Profile Completeness</p>
          <p className="text-2xl font-bold text-gray-900">{artist?.completeness_score ?? 0}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Listings</p>
          <p className="text-2xl font-bold text-gray-900">—</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900">—</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-gray-900">—</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/listings/new"><Button>Create Listing</Button></Link>
        <Link href="/profile/edit"><Button variant="outline">Edit Profile</Button></Link>
        <Link href="/commissions"><Button variant="outline">Commissions</Button></Link>
        <Link href="/payouts"><Button variant="outline">Payouts</Button></Link>
      </div>
    </div>
  );
}
