'use client';
import { useMature } from '@/context/MatureContext';

import { useMemo, useState } from 'react';
import { GalleryGrid } from '@/components/artist/GalleryGrid';
import { FilterChip } from '@/components/ui/FilterChip';
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

  // Ruling D8: an artist's own page is a browsing surface too. Filtered
  // client-side because this page is server-rendered and the preference lives
  // in the viewer's browser — and unlike the feed, the count of what was
  // hidden is worth saying, so the page does not silently look emptier than
  // the artist's shop actually is.
  const { showMature, setShowMature } = useMature();
  const hiddenMature = useMemo(
    () => (showMature ? 0 : listings.filter((l) => l.is_mature).length),
    [listings, showMature]
  );

  const visible = useMemo(() => {
    let result = listings;
    if (!showMature) result = result.filter((l) => !l.is_mature);
    if (activeSeries !== 'all') result = result.filter((l) => l.series_id === activeSeries);
    if (statusFilter !== 'all') result = result.filter((l) => l.status === statusFilter);
    return result;
  }, [listings, activeSeries, statusFilter, showMature]);

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
          <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)}>
            {f === 'available' ? 'Available' : f === 'sold' ? 'Sold' : 'All'}
          </FilterChip>
        ))}
      </div>

      <GalleryGrid listings={visible} />

      {hiddenMature > 0 && (
        <p className="mt-4 text-sm text-muted">
          {hiddenMature === 1 ? '1 piece is' : `${hiddenMature} pieces are`} hidden because{' '}
          {hiddenMature === 1 ? 'it contains' : 'they contain'} nudity or mature themes.{' '}
          <button
            type="button"
            onClick={() => setShowMature(true)}
            className="font-medium text-terraText underline underline-offset-2 hover:text-terraTextDark"
          >
            Show mature work
          </button>
        </p>
      )}
    </div>
  );
}
