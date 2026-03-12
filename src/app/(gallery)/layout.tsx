import { PageShell } from '@/components/layout/PageShell';
import { AuthGuard } from '@/components/layout/AuthGuard';

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['gallery']}>{children}</AuthGuard>
    </PageShell>
  );
}
