'use client';

import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import Link from 'next/link';

const links = [
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/galleries', label: 'Gallery Verification' },
  { href: '/admin/listings', label: 'Listings' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/disputes', label: 'Disputes' },
];

export default function AdminPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-lg border border-gray-200 p-6 transition-colors hover:bg-gray-50">
                <h2 className="font-medium text-gray-900">{link.label}</h2>
              </Link>
            ))}
          </div>
        </div>
      </AuthGuard>
    </PageShell>
  );
}
