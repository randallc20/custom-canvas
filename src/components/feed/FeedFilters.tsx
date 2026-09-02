'use client';

import { useState, useRef, useEffect } from 'react';
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
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Controlled so the box reflects external changes (navbar search, Clear).
  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  useEffect(() => { setSearchInput(filters.search ?? ''); }, [filters.search]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onFilterChange({ ...filters, search: value || undefined });
    }, 300);
  };

  const activeCount = activeFilterCount(filters);

  return (
    <div className="mb-6 space-y-3">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          aria-label="Search art, artists, styles"
          value={searchInput}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search art, artists, styles..."
          className="w-full rounded-full border border-line bg-surface py-2 pl-10 pr-4 text-sm text-ink placeholder:text-muted/70 focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
        />
      </div>

      <div className="hidden md:block">
        <FilterControls layout="row" filters={filters} city={city} onFilterChange={onFilterChange} />
      </div>

      <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink md:hidden">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeCount > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terra text-xs text-white">{activeCount}</span>}
      </button>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} city={city} onFilterChange={onFilterChange} />
    </div>
  );
}
