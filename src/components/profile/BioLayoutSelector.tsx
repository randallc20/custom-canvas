'use client';

import type { BioLayout } from '@/types/artist';

const LAYOUTS: Array<{ id: BioLayout; label: string }> = [
  { id: 'left', label: 'Left-aligned' },
  { id: 'center', label: 'Centered' },
  { id: 'minimal', label: 'Minimal' },
];

function MiniPreview({ layout }: { layout: BioLayout }) {
  const align = layout === 'center' ? 'items-center' : 'items-start';
  return (
    <div className={`flex h-20 w-full flex-col gap-1 rounded-lg bg-sand p-2 ${align}`}>
      <div className="h-3 w-3 rounded-full bg-terra/70" />
      <div className="h-1.5 w-1/2 rounded bg-ink/40" />
      {layout !== 'minimal' && <div className="h-1 w-3/4 rounded bg-ink/20" />}
      {layout !== 'minimal' && <div className="h-1 w-2/3 rounded bg-ink/20" />}
    </div>
  );
}

interface BioLayoutSelectorProps {
  value: BioLayout;
  onChange: (layout: BioLayout) => void;
}

export function BioLayoutSelector({ value, onChange }: BioLayoutSelectorProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">Bio layout</p>
      <div className="grid grid-cols-3 gap-3">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => onChange(layout.id)}
            className={`rounded-xl border p-2 text-left transition-colors duration-150
              ${value === layout.id ? 'border-terra bg-terraSoft' : 'border-line bg-surface hover:bg-sand/40'}`}
          >
            <MiniPreview layout={layout.id} />
            <p className="mt-1.5 text-xs font-medium text-ink">{layout.label}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
