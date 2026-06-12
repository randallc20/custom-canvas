import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['user', 'artist', 'gallery']}>{children}</AuthGuard>
    </PageShell>
  );
}
