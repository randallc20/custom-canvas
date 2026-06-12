'use client';

import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { ArtistProfileEdit } from '@/components/profile/ArtistProfileEdit';
import { GalleryProfileEdit } from '@/components/profile/GalleryProfileEdit';

export default function ProfileEditPage() {
  const { user } = useAuth();

  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist', 'gallery']}>
        {user?.role === 'gallery' ? <GalleryProfileEdit /> : <ArtistProfileEdit />}
      </AuthGuard>
    </PageShell>
  );
}
