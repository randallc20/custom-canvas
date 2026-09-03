'use client';

import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatPrice } from '@/utils/formatPrice';

interface DisputedCommission {
  id: string;
  title: string;
  description: string;
  status: string;
  budget_min_cents: number;
  budget_max_cents: number;
  quoted_price_cents: number | null;
  dispute_reason: string | null;
  pre_dispute_status: string | null;
  conversation_id: string | null;
  updated_at: string;
  artist: { display_name: string; slug: string } | null;
  requester: { full_name: string | null } | null;
}

export default function AdminCommissionsPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <Content />
      </AuthGuard>
    </PageShell>
  );
}

function Content() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DisputedCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<DisputedCommission | null>(null);
  const [outcome, setOutcome] = useState<'confirmed' | 'cancelled'>('confirmed');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/commissions?status=disputed');
    if (!res.ok) {
      captureException(new Error(`admin commissions load failed (HTTP ${res.status})`), { where: 'admin.commissions.load' });
      toast('Could not load disputed commissions', 'error');
      setLoading(false);
      return;
    }
    setRows((await res.json()) as DisputedCommission[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const openResolve = (row: DisputedCommission) => {
    setOutcome('confirmed');
    setReason('');
    setResolving(row);
  };

  const submit = async () => {
    if (!resolving) return;
    if (!reason.trim()) { toast('Record why this dispute was resolved that way.', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/commissions/${resolving.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Could not resolve the dispute.');
      toast(outcome === 'confirmed' ? 'Commission confirmed — both sides notified.' : 'Commission cancelled — both sides notified.', 'success');
      setRows((prev) => prev.filter((r) => r.id !== resolving.id));
      setResolving(null);
    } catch (err) {
      captureException(err, { where: 'admin.commissions.resolve' });
      toast(err instanceof Error ? err.message : 'Could not resolve the dispute.', 'error');
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-ink">Disputed Commissions</h1>
      <p className="mb-6 text-sm text-muted">
        A disputed commission is frozen: the artist cannot deliver and the requester cannot confirm.
        Closing it as confirmed means the work stands; cancelled means it does not. Both sides are
        told, with your reason.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Nothing disputed" description="Disputed commissions land here." />
      ) : (
        <div className="space-y-4">
          {rows.map((c) => (
            <div key={c.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{c.title}</p>
                  <p className="text-xs text-muted">
                    {c.artist?.display_name ?? 'Unknown artist'} · requested by {c.requester?.full_name ?? 'a deleted account'}
                  </p>
                </div>
                <Badge variant="danger">Disputed</Badge>
              </div>
              <p className="mt-2 text-sm text-muted">
                Budget {formatPrice(c.budget_min_cents)} – {formatPrice(c.budget_max_cents)}
                {c.quoted_price_cents != null && <> · quoted {formatPrice(c.quoted_price_cents)}</>}
                {c.pre_dispute_status && <> · was {c.pre_dispute_status.replace('_', ' ')}</>}
              </p>
              {c.dispute_reason && (
                <div className="mt-3 rounded-lg border border-line bg-sand/50 p-3">
                  <h3 className="text-sm font-medium text-ink">What the requester says</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{c.dispute_reason}</p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => openResolve(c)}>Resolve</Button>
                {c.conversation_id && (
                  <a href={`/messages/${c.conversation_id}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">Open thread</Button>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={!!resolving} title="Resolve dispute" onClose={() => setResolving(null)}>
        <div className="space-y-4">
          <p className="text-sm text-muted">&ldquo;{resolving?.title}&rdquo;</p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" className="mt-1" checked={outcome === 'confirmed'} onChange={() => setOutcome('confirmed')} />
              <span>Confirmed — the work stands and the commission closes as complete.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-ink">
              <input type="radio" className="mt-1" checked={outcome === 'cancelled'} onChange={() => setOutcome('cancelled')} />
              <span>Cancelled — the commission closes without completion.</span>
            </label>
          </div>
          <div>
            <label htmlFor="resolve_reason" className="mb-1 block text-sm font-medium text-ink">
              Reason (shown to both sides)
            </label>
            <textarea
              id="resolve_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              className="w-full rounded-lg border border-line px-3 py-2 text-sm
                focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
              placeholder="What was decided, and why."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setResolving(null)}>Cancel</Button>
            <Button onClick={submit} loading={saving} disabled={!reason.trim()}>Resolve dispute</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
