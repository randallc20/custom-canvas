'use client';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ArtistEducation } from '@/types/artist';

export type EducationDraft = Omit<ArtistEducation, 'id' | 'artist_id' | 'created_at'> & { id?: string };

export function emptyEducationEntry(order: number): EducationDraft {
  return {
    institution: '',
    degree: null,
    field_of_study: null,
    start_year: null,
    end_year: null,
    is_current: false,
    display_order: order,
  };
}

interface EducationFieldsetProps {
  entries: EducationDraft[];
  onChange: (entries: EducationDraft[]) => void;
}

export function EducationFieldset({ entries, onChange }: EducationFieldsetProps) {
  const update = (i: number, patch: Partial<EducationDraft>) =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const remove = (i: number) => onChange(entries.filter((_, j) => j !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {entries.map((entry, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted">Entry {i + 1}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                className="rounded p-1 text-muted hover:text-ink disabled:opacity-30">↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === entries.length - 1} aria-label="Move down"
                className="rounded p-1 text-muted hover:text-ink disabled:opacity-30">↓</button>
              <button type="button" onClick={() => remove(i)} aria-label="Remove entry"
                className="rounded p-1 text-muted hover:text-red-600">✕</button>
            </div>
          </div>
          <Input
            label="School / Program name"
            value={entry.institution}
            onChange={(e) => update(i, { institution: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Degree / Certificate"
              value={entry.degree ?? ''}
              onChange={(e) => update(i, { degree: e.target.value || null })}
            />
            <Input
              label="Field of study"
              value={entry.field_of_study ?? ''}
              onChange={(e) => update(i, { field_of_study: e.target.value || null })}
            />
          </div>
          <div className="grid grid-cols-3 items-end gap-3">
            <Input
              label="Start year"
              type="number"
              value={entry.start_year ?? ''}
              onChange={(e) => update(i, { start_year: e.target.value ? parseInt(e.target.value, 10) : null })}
            />
            <Input
              label="End year"
              type="number"
              disabled={entry.is_current}
              value={entry.is_current ? '' : entry.end_year ?? ''}
              onChange={(e) => update(i, { end_year: e.target.value ? parseInt(e.target.value, 10) : null })}
            />
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={entry.is_current}
                onChange={(e) => update(i, { is_current: e.target.checked, end_year: e.target.checked ? null : entry.end_year })}
                className="rounded border-line"
              />
              <span className="text-sm text-ink">Current</span>
            </label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...entries, emptyEducationEntry(entries.length)])}>
        Add education
      </Button>
    </div>
  );
}
