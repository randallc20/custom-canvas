import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function ArtistLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['artist']}>{children}</AuthGuard>
    </PageShell>
  );
}
