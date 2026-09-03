'use client';

import { useCallback, useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/**
 * The DMCA log (L11). The policy commits to a process with dates in it —
 * remove, notify, forward a counter-notice, restore between 10 and 14
 * business days later, and count substantiated notices over a trailing year.
 * None of that can be run out of an inbox, which is what this replaces.
 *
 * The repeat-infringer count comes from `dmca_substantiated_count()` in SQL,
 * not from arithmetic here, so the number on this page cannot drift from the
 * policy's own definition of what counts.
 */

type Notice = {
  id: string;
  subject_profile_id: string | null;
  listing_id: string | null;
  claimant_name: string;
  claimant_email: string;
  received_at: string;
  kind: 'notice' | 'counter_notice';
  status: string;
  notes: string | null;
  subject: { full_name: string | null } | null;
  listing: { title: string; status: string; dmca_removed_at: string | null } | null;
};

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  received: 'warning',
  material_removed: 'danger',
  counter_received: 'warning',
  restored: 'success',
  withdrawn: 'default',
  defective: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  material_removed: 'Material removed',
  counter_received: 'Counter-notice received',
  restored: 'Restored',
  withdrawn: 'Withdrawn',
  defective: 'Defective',
};

export default function AdminDmcaPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <DmcaContent />
      </AuthGuard>
    </PageShell>
  );
}

function DmcaContent() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    claimant_name: '',
    claimant_email: '',
    listing_id: '',
    subject_profile_id: '',
    kind: 'notice' as 'notice' | 'counter_notice',
    notes: '',
  });
  const { toast } = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dmca', { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
      const body = await res.json();
      setNotices(body.notices);
      setCounts(body.counts ?? {});
    } catch (e) {
      captureException(e, { where: 'admin.dmca.load' });
      toast(e instanceof Error ? e.message : 'Could not load the DMCA log', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!form.claimant_name.trim() || !form.claimant_email.trim()) {
      toast('The claimant’s name and email are required — an incomplete notice may not trigger our obligations.', 'error');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/dmca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimant_name: form.claimant_name.trim(),
          claimant_email: form.claimant_email.trim(),
          listing_id: form.listing_id.trim() || null,
          subject_profile_id: form.subject_profile_id.trim() || null,
          kind: form.kind,
          notes: form.notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error?.toString() || 'Failed');
      toast('Logged.', 'success');
      setForm({ claimant_name: '', claimant_email: '', listing_id: '', subject_profile_id: '', kind: 'notice', notes: '' });
      await load();
    } catch (e) {
      captureException(e, { where: 'admin.dmca.create' });
      toast(e instanceof Error ? e.message : 'Could not log that notice', 'error');
    } finally {
      setCreating(false);
    }
  };

  const act = async (id: string, action: string, label: string, warn?: string) => {
    if (warn) {
      const ok = await confirm({ title: label, message: warn, confirmLabel: label, destructive: action === 'remove_material' });
      if (!ok) return;
    }
    setBusy(id);
    try {
      const res = await fetch('/api/admin/dmca', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.toString() || 'Failed');
      toast(body.overdue ? 'Restored — note this was past the 14-business-day window.' : 'Done.', body.overdue ? 'error' : 'success');
      await load();
    } catch (e) {
      captureException(e, { where: 'admin.dmca.act' });
      toast(e instanceof Error ? e.message : 'Could not do that', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">DMCA notices</h1>
      <p className="mt-1 text-sm text-muted">
        The process the DMCA policy commits to. Removal is not a finding of infringement, and
        restoration is not a finding that the material is lawful — the page says so because the
        policy does.
      </p>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Log a notice</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Claimant name" value={form.claimant_name} onChange={(e) => setForm({ ...form, claimant_name: e.target.value })} />
          <Input label="Claimant email" type="email" value={form.claimant_email} onChange={(e) => setForm({ ...form, claimant_email: e.target.value })} />
          <Input label="Listing id (optional)" value={form.listing_id} onChange={(e) => setForm({ ...form, listing_id: e.target.value })} />
          <Input label="Subject profile id (optional)" value={form.subject_profile_id} onChange={(e) => setForm({ ...form, subject_profile_id: e.target.value })} />
          <div>
            <label htmlFor="dmca-kind" className="mb-1 block text-sm font-medium text-ink">Kind</label>
            <select
              id="dmca-kind"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as 'notice' | 'counter_notice' })}
            >
              <option value="notice">Notice</option>
              <option value="counter_notice">Counter-notice</option>
            </select>
          </div>
        </div>
        <Textarea
          label="Notes"
          rows={3}
          className="mt-3"
          placeholder="Which of the six required elements are present, the work claimed, and anything the claimant was asked to clarify."
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <div className="mt-3 flex justify-end">
          <Button loading={creating} onClick={submit}>Log it</Button>
        </div>
      </section>

      <div className="mt-8 space-y-3">
        {notices.length === 0 && <p className="text-sm text-muted">No notices logged.</p>}
        {notices.map((n) => {
          const count = n.subject_profile_id ? counts[n.subject_profile_id] ?? 0 : 0;
          return (
            <div key={n.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {n.claimant_name}{' '}
                    <span className="font-normal text-muted">&lt;{n.claimant_email}&gt;</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {n.kind === 'counter_notice' ? 'Counter-notice' : 'Notice'} ·{' '}
                    {new Date(n.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {n.listing && <> · {n.listing.title}</>}
                    {n.subject?.full_name && <> · about {n.subject.full_name}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {count >= 3 && (
                    <Badge variant="danger">Repeat infringer — {count} in 12 months</Badge>
                  )}
                  {count > 0 && count < 3 && (
                    <span className="text-xs text-muted">{count} substantiated in 12 months</span>
                  )}
                  <Badge variant={STATUS_VARIANT[n.status] ?? 'default'}>
                    {STATUS_LABEL[n.status] ?? n.status}
                  </Badge>
                </div>
              </div>

              {n.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{n.notes}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {n.status === 'received' && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={busy === n.id}
                    onClick={() => act(n.id, 'remove_material', 'Remove the material',
                      'The listing is hidden and stamped so the artist cannot republish it. Tell the user, and send them a copy or summary of the notice including the claimant’s contact details — the policy commits to taking reasonable steps to do that.')}
                  >
                    Remove material
                  </Button>
                )}
                {['received', 'material_removed'].includes(n.status) && (
                  <>
                    <Button size="sm" variant="outline" loading={busy === n.id} onClick={() => act(n.id, 'counter_received', 'Counter-notice received', 'Forward the counter-notice to the original claimant. Restoration becomes available 10 business days from now, and must not wait past 14.')}>
                      Counter-notice received
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === n.id} onClick={() => act(n.id, 'withdraw', 'Mark withdrawn', 'A withdrawn notice does not count toward repeat infringement.')}>
                      Withdrawn
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === n.id} onClick={() => act(n.id, 'defective', 'Mark defective', 'A plainly defective notice does not count toward repeat infringement. Note which elements were missing.')}>
                      Defective
                    </Button>
                  </>
                )}
                {n.status === 'counter_received' && (
                  <Button size="sm" variant="outline" loading={busy === n.id} onClick={() => act(n.id, 'restore', 'Restore the material', 'Only if the designated agent has NOT received notice of a qualifying court action. The route refuses before 10 business days and flags a restore past 14.')}>
                    Restore
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
