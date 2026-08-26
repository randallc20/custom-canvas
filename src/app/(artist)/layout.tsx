import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ArtistSetupGuard } from '@/components/layout/ArtistSetupGuard';

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist']}>
        <ArtistSetupGuard>{children}</ArtistSetupGuard>
      </AuthGuard>
    </PageShell>
  );
}
