'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import type { Profile } from '@/types/user';

export default function AdminUsersPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <UsersContent />
      </AuthGuard>
    </PageShell>
  );
}

const ROLE_VARIANT: Record<string, 'default' | 'success' | 'info' | 'warning' | 'danger'> = {
  admin: 'danger',
  artist: 'info',
  gallery: 'warning',
  user: 'default',
};

function UsersContent() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Emails aren't client-readable (00031) — go through the admin API.
    fetch('/api/admin/users?limit=200')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  }, []);

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Users ({users.length})</h1>

      <div className="mb-6">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-sand/50">
            <tr>
              <th className="px-4 py-3 font-medium text-ink">Name</th>
              <th className="px-4 py-3 font-medium text-ink">Email</th>
              <th className="px-4 py-3 font-medium text-ink">Role</th>
              <th className="px-4 py-3 font-medium text-ink">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-sand/50">
                <td className="px-4 py-3 font-medium text-ink">
                  {u.full_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_VARIANT[u.role] ?? 'default'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
