'use client';

import { useMemo, useState } from 'react';
import { GalleryGrid } from '@/components/artist/GalleryGrid';
import type { ListingWithImages } from '@/types/listing';
import type { ListingSeries } from '@/types/artist';

type StatusFilter = 'available' | 'sold' | 'all';

interface SeriesTabsProps {
  listings: (ListingWithImages & { series_id?: string | null })[];
  series: ListingSeries[];
  accentColor?: string;
}

export function SeriesTabs({ listings, series, accentColor = '#E8704A' }: SeriesTabsProps) {
  const [activeSeries, setActiveSeries] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('available');

  const visible = useMemo(() => {
    let result = listings;
    if (activeSeries !== 'all') result = result.filter((l) => l.series_id === activeSeries);
    if (statusFilter !== 'all') result = result.filter((l) => l.status === statusFilter);
    return result;
  }, [listings, activeSeries, statusFilter]);

  const tabs = [{ id: 'all' as const, name: 'All Work' }, ...series.map((s) => ({ id: s.id, name: s.name }))];
  const activeDescription = activeSeries !== 'all' ? series.find((s) => s.id === activeSeries)?.description : null;

  return (
    <div>
      {series.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3">
          {tabs.map((tab) => {
            const isActive = activeSeries === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSeries(tab.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150
                  ${isActive ? 'text-white' : 'bg-sand text-muted hover:text-ink'}`}
                style={isActive ? { backgroundColor: accentColor } : undefined}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      )}

      {activeDescription && <p className="mb-4 max-w-prose text-sm text-muted">{activeDescription}</p>}

      <div className="mb-4 flex gap-2">
        {(['available', 'sold', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150
              ${statusFilter === f ? 'bg-ink text-cream' : 'bg-sand text-muted hover:text-ink'}`}
          >
            {f === 'available' ? 'Available' : f === 'sold' ? 'Sold' : 'All'}
          </button>
        ))}
      </div>

      <GalleryGrid listings={visible} />
    </div>
  );
}
