'use client';

import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { ArtistDashboard } from '@/components/dashboard/ArtistDashboard';
import { GalleryDashboard } from '@/components/dashboard/GalleryDashboard';

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'gallery']}>
        {user?.role === 'gallery' ? <GalleryDashboard /> : <ArtistDashboard />}
      </AuthGuard>
    </PageShell>
  );
}
