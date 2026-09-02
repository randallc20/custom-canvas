'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import Image from 'next/image';
import { useCommissionUpdates } from '@/hooks/useCommissionUpdates';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { formatTime } from '@/utils/formatTime';

interface CommissionUpdatesProps {
  commissionId: string;
  isArtist: boolean;
  /** Updates are postable once work is underway. */
  canPost: boolean;
}

export function CommissionUpdates({ commissionId, isArtist, canPost }: CommissionUpdatesProps) {
  const { data: updates = [], isLoading, refetch } = useCommissionUpdates(commissionId);
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const latestProgress = updates.find((u) => u.progress_percent != null)?.progress_percent ?? null;

  const submit = async () => {
    if (!note.trim()) { toast('Add a short note first.', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/commissions/${commissionId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim(), photoUrl, progressPercent: progress === '' ? null : progress }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNote(''); setPhotoUrl(null); setProgress('');
      toast('Update posted — the buyer has been notified.', 'success');
      refetch();
    } catch (e) {
      captureException(e, { where: 'CommissionUpdates.post' });
      toast(e instanceof Error ? e.message : 'Failed to post update', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-8 border-t border-line pt-6">
      <h3 className="mb-3 font-display text-lg font-semibold text-ink">Progress</h3>

      {latestProgress != null && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Overall progress</span><span>{latestProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sand">
            <div className="h-full rounded-full bg-terra transition-all" style={{ width: `${latestProgress}%` }} />
          </div>
        </div>
      )}

      {isArtist && canPost && (
        <div className="mb-6 space-y-3 rounded-xl border border-line bg-surface p-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Share a quick progress update with your buyer…"
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
          />
          {photoUrl ? (
            <div className="relative inline-block">
              <Image src={photoUrl} alt="Update photo" width={120} height={120} className="h-24 w-24 rounded-lg object-cover" />
              <button onClick={() => setPhotoUrl(null)} className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-white">×</button>
            </div>
          ) : (
            <ImageUpload endpoint="/api/storage/listing-image" maxFiles={1} maxSizeMB={5} label="Add a WIP photo (optional)" onUpload={(urls) => setPhotoUrl(urls[0])} />
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted">Progress %</label>
            <input
              type="number" min={0} max={100} value={progress}
              onChange={(e) => setProgress(e.target.value === '' ? '' : Math.max(0, Math.min(100, Number(e.target.value))))}
              placeholder="optional"
              className="w-24 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink"
            />
            <Button className="ml-auto" onClick={submit} loading={submitting}>Post update</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : updates.length === 0 ? (
        <p className="text-sm text-muted">No updates yet{isArtist ? ' — post one to keep your buyer in the loop.' : '. The artist will post progress here.'}</p>
      ) : (
        <ol className="space-y-4">
          {updates.map((u) => (
            <li key={u.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="whitespace-pre-wrap text-sm text-ink">{u.note}</p>
              {u.photo_url && (
                <button onClick={() => setLightbox(u.photo_url)} className="mt-2 block">
                  <Image src={u.photo_url} alt="Progress" width={200} height={200} className="h-32 w-32 rounded-lg object-cover" />
                </button>
              )}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                <span>{formatTime(u.created_at)}</span>
                {u.progress_percent != null && <span className="rounded-full bg-terraSoft px-2 py-0.5 text-terraDark">{u.progress_percent}%</span>}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal
        isOpen={!!lightbox}
        onClose={() => setLightbox(null)}
        ariaLabel="Progress photo"
        containerClassName="fixed inset-0 z-50 flex items-center justify-center p-4"
        overlayClassName="fixed inset-0 animate-fade-in bg-ink/80"
        panelClassName="relative z-10 max-h-full"
        floatingClose
      >
        {lightbox && (
          <Image src={lightbox} alt="Progress" width={1000} height={1000} className="max-h-[90vh] w-auto rounded-lg object-contain" />
        )}
      </Modal>
    </div>
  );
}
