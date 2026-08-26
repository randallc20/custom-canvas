'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { useSeries, useInvalidateArtistContent } from '@/hooks/useArtistContent';
import { createSeries, updateSeries, deleteSeries } from '@/services/artistContent';
import { swapDisplayOrder } from '@/utils/reorder';
import { useArtistProfileId } from '@/hooks/useArtistProfileId';
import Image from 'next/image';
import type { ListingSeries } from '@/types/artist';

export function SeriesSection() {
  const { toast } = useToast();
  const { artistId, loading: loadingArtist } = useArtistProfileId();
  const { data: series = [], isLoading } = useSeries(artistId);
  const invalidate = useInvalidateArtistContent();

  const [editing, setEditing] = useState<ListingSeries | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ListingSeries | null>(null);
  const [form, setForm] = useState({ name: '', description: '', cover_image_url: '' });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setForm({ name: '', description: '', cover_image_url: '' });
    setCreating(true);
  };

  const openEdit = (s: ListingSeries) => {
    setForm({ name: s.name, description: s.description ?? '', cover_image_url: s.cover_image_url ?? '' });
    setEditing(s);
  };

  const closeModal = () => { setCreating(false); setEditing(null); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateSeries(editing.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          cover_image_url: form.cover_image_url || null,
        });
        toast('Series updated', 'success');
      } else {
        await createSeries(artistId, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          cover_image_url: form.cover_image_url || null,
          display_order: series.length,
        });
        toast('Series created', 'success');
      }
      invalidate(artistId, 'series');
      closeModal();
    } catch {
      toast('Failed to save series', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteSeries(confirmDelete.id);
      toast('Series deleted — its listings stay in All Work', 'success');
      invalidate(artistId, 'series');
    } catch {
      toast('Failed to delete series', 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    try {
      const moved = await swapDisplayOrder(series, i, dir, (id, order) => updateSeries(id, { display_order: order }));
      if (moved) invalidate(artistId, 'series');
    } catch {
      toast('Could not reorder the series', 'error');
    }
  };

  if (loadingArtist || isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          Group your work into collections. Buyers see them as tabs on your profile.
        </p>
        <Button onClick={openCreate}>New Series</Button>
      </div>

      {series.length === 0 ? (
        <EmptyState
          title="No series yet"
          description="Create your first series to organize your portfolio — like “Bayou Landscapes” or “Portraits 2026.”"
          action={<Button onClick={openCreate}>Create a series</Button>}
        />
      ) : (
        <div className="space-y-3">
          {series.map((s, i) => (
            <div key={s.id} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
              {s.cover_image_url ? (
                <Image src={s.cover_image_url} alt={s.name} width={64} height={64} className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-sand text-xs text-muted">No cover</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{s.name}</p>
                {s.description && <p className="truncate text-sm text-muted">{s.description}</p>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                  className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === series.length - 1} aria-label="Move down"
                  className="rounded p-1.5 text-muted hover:text-ink disabled:opacity-30">↓</button>
                <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(s)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={creating || !!editing} title={editing ? 'Edit Series' : 'New Series'} onClose={closeModal}>
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Bayou Landscapes"
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Description (optional)</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-ink">Cover image (optional)</p>
            {form.cover_image_url && (
              <Image src={form.cover_image_url} alt="Series cover" width={120} height={120} className="mb-2 h-24 w-24 rounded-lg object-cover" />
            )}
            <ImageUpload
              endpoint="/api/storage/listing-image"
              maxFiles={1}
              maxSizeMB={5}
              onUpload={(urls) => setForm((f) => ({ ...f, cover_image_url: urls[0] }))}
            />
          </div>
          <Button className="w-full" onClick={handleSave} loading={saving} disabled={!form.name.trim()}>
            {editing ? 'Save Changes' : 'Create Series'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!confirmDelete} title="Delete series?" onClose={() => setConfirmDelete(null)}>
        <p className="mb-4 text-sm text-muted">
          &ldquo;{confirmDelete?.name}&rdquo; will be deleted. Listings in this series are kept and
          return to All Work.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
