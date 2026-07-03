'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { GalleryDashboard } from '@/components/dashboard/GalleryDashboard';
import { Spinner } from '@/components/ui/Spinner';

// Artists moved to /studio (Build 3 Phase 4); galleries keep this dashboard.
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'gallery']}>
        {user?.role === 'gallery' ? <GalleryDashboard /> : <StudioRedirect />}
      </AuthGuard>
    </PageShell>
  );
}

function StudioRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio');
  }, [router]);
  return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
}
