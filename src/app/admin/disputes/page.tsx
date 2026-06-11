'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import type { Report, ReportStatus } from '@/types/report';

interface ReportWithContext extends Report {
  reporter?: { full_name: string | null; email: string } | null;
  listing?: { title: string } | null;
}

const STATUS_VARIANT: Record<ReportStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  reviewed: 'default',
  dismissed: 'default',
  action_taken: 'success',
};

export default function AdminDisputesPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <DisputesContent />
      </AuthGuard>
    </PageShell>
  );
}

function DisputesContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reports, setReports] = useState<ReportWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [resolveModal, setResolveModal] = useState<ReportWithContext | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [resolveAction, setResolveAction] = useState<ReportStatus>('dismissed');

  useEffect(() => {
    supabase
      .from('reports')
      .select('*, reporter:profiles!reports_reporter_id_fkey(full_name, email), listing:listings!reports_listing_id_fkey(title)')
      .order('created_at', { ascending: tab === 'pending' })
      .then(({ data }) => {
        setReports((data ?? []) as unknown as ReportWithContext[]);
        setLoading(false);
      });
  }, [tab]);

  const filtered = tab === 'pending'
    ? reports.filter((r) => r.status === 'pending')
    : reports.filter((r) => r.status !== 'pending');

  const handleResolve = async () => {
    if (!resolveModal || !user) return;
    const { error } = await supabase
      .from('reports')
      .update({
        status: resolveAction,
        admin_notes: adminNotes.trim() || null,
        resolved_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolveModal.id);

    if (error) {
      toast('Failed to resolve report.', 'error');
      return;
    }

    setReports((prev) =>
      prev.map((r) =>
        r.id === resolveModal.id ? { ...r, status: resolveAction, admin_notes: adminNotes.trim() || null } : r
      )
    );
    toast('Report resolved.', 'success');
    setResolveModal(null);
    setAdminNotes('');
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Reports &amp; Disputes</h1>

      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => { setTab('pending'); setLoading(true); }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => { setTab('resolved'); setLoading(true); }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'resolved' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Resolved
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? 'No pending reports' : 'No resolved reports'}
          description={tab === 'pending' ? 'All reports have been reviewed.' : 'Resolved reports will appear here.'}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((report) => (
            <div key={report.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[report.status]}>{report.status.replace('_', ' ')}</Badge>
                    <Badge>{report.reason}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-gray-900">
                    Listing:{' '}
                    {report.listing ? (
                      <Link href={`/listing/${report.listing_id}`} className="font-medium text-[#E8704A] hover:underline">
                        {report.listing.title}
                      </Link>
                    ) : (
                      <span className="text-gray-400">Deleted</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    Reported by: {report.reporter?.full_name ?? report.reporter?.email ?? '—'}
                  </p>
                  {report.description && (
                    <p className="mt-2 text-sm text-gray-600">{report.description}</p>
                  )}
                  {report.admin_notes && (
                    <p className="mt-2 rounded bg-gray-50 px-2 py-1 text-sm text-gray-500">
                      Admin: {report.admin_notes}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-gray-400">
                    {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {report.status === 'pending' && (
                  <Button size="sm" onClick={() => setResolveModal(report)}>Resolve</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!resolveModal}
        title="Resolve Report"
        onClose={() => { setResolveModal(null); setAdminNotes(''); }}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Action</label>
            <select
              value={resolveAction}
              onChange={(e) => setResolveAction(e.target.value as ReportStatus)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="dismissed">Dismiss — No action needed</option>
              <option value="action_taken">Action Taken — Listing removed or user warned</option>
              <option value="reviewed">Reviewed — Noted for monitoring</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Admin Notes</label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20"
              placeholder="Internal notes about this resolution..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setResolveModal(null); setAdminNotes(''); }}>Cancel</Button>
            <Button onClick={handleResolve}>Resolve</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
