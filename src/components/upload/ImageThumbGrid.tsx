'use client';

import Image from 'next/image';

interface ThumbItem {
  key: string;
  url: string;
}

interface ImageThumbGridProps {
  items: ThumbItem[];
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (index: number) => void;
  alt?: string;
}

// The first image is the listing's cover — it's what feed cards and
// search results show.
export function ImageThumbGrid({ items, onMove, onRemove, alt = 'Listing image' }: ImageThumbGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item, i) => (
        <div key={item.key} className="relative aspect-square">
          <Image
            src={item.url}
            alt={alt}
            fill
            sizes="(max-width: 640px) 50vw, 200px"
            className="rounded-xl border border-line object-cover"
          />
          <div className="absolute right-1 top-1 flex gap-1">
            <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label="Move earlier"
              className="rounded-full bg-ink/60 px-1.5 text-xs text-cream disabled:opacity-40">↑</button>
            <button type="button" onClick={() => onMove(i, 1)} disabled={i === items.length - 1} aria-label="Move later"
              className="rounded-full bg-ink/60 px-1.5 text-xs text-cream disabled:opacity-40">↓</button>
            <button type="button" onClick={() => onRemove(i)} aria-label="Remove image"
              className="rounded-full bg-ink/60 px-1.5 text-xs text-cream hover:bg-red-600">✕</button>
          </div>
          {i === 0 && (
            <span className="absolute bottom-1 left-1 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] text-cream">
              Cover
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
