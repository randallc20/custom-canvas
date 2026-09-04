'use client';

import { useState } from 'react';
import { FilterDrawer } from './FilterDrawer';
import { FilterControls } from './FilterControls';
import { activeFilterCount, type FeedFilterValues } from './filterTypes';

export { MEDIUM_OPTIONS } from './filterTypes';
export type { FeedFilterValues } from './filterTypes';

interface FeedFiltersProps {
  filters: FeedFilterValues;
  /** Effective community scope (respects the Everywhere toggle). */
  city?: string;
  onFilterChange: (filters: FeedFilterValues) => void;
}

export function FeedFilters({ filters, city, onFilterChange }: FeedFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeCount = activeFilterCount(filters);

  return (
    <div className="mb-6 space-y-3">
      {/* The search input lived here AND in the navbar, with the same
          placeholder, writing the same `q` to the same feed — one search
          rendered twice. The navbar's is the one that survives: it works from
          every page and it suggests. What remains here is the state, as
          something you can see and remove. */}
      {filters.search && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Searching</span>
          <button
            type="button"
            onClick={() => onFilterChange({ ...filters, search: undefined })}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-sm font-medium text-cream"
            aria-label={`Clear search for ${filters.search}`}
          >
            &ldquo;{filters.search}&rdquo;
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="hidden md:block">
        <FilterControls layout="row" filters={filters} city={city} onFilterChange={onFilterChange} />
      </div>

      <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink md:hidden">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeCount > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terraText text-xs text-white">{activeCount}</span>}
      </button>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} city={city} onFilterChange={onFilterChange} />
    </div>
  );
}
