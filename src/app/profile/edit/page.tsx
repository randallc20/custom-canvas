'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { GalleryProfileEdit } from '@/components/profile/GalleryProfileEdit';
import { Spinner } from '@/components/ui/Spinner';

// Artists edit their public page at /studio/page (Build 3 Phase 4);
// galleries keep this route.
export default function ProfileEditPage() {
  const { user } = useAuth();

  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'gallery']}>
        {user?.role === 'gallery' ? <GalleryProfileEdit /> : <StudioPageRedirect />}
      </AuthGuard>
    </PageShell>
  );
}

function StudioPageRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/studio/page');
  }, [router]);
  return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
}
