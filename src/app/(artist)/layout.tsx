import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ArtistSetupGuard } from '@/components/layout/ArtistSetupGuard';
import { NotLiveNotice } from '@/components/studio/NotLiveNotice';

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist']}>
        <ArtistSetupGuard>
          {/* Every artist surface — studio tabs AND the listing forms — says
              so while the shop isn't publicly visible (skips /studio, whose
              checklist owns that message). */}
          <NotLiveNotice />
          {children}
        </ArtistSetupGuard>
      </AuthGuard>
    </PageShell>
  );
}
