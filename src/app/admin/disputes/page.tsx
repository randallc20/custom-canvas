'use client';

import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';

export default function AdminPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold text-gray-900">TITLE</h1>
          <p className="text-gray-500">Admin management interface coming soon.</p>
        </div>
      </AuthGuard>
    </PageShell>
  );
}
