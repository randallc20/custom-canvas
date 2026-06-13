'use client';

import { useState, useRef } from 'react';
import { FilterDrawer } from './FilterDrawer';
import { useFilterOptions } from '@/hooks/useFeed';

export const MEDIUM_OPTIONS = [
  'Oil Paint', 'Acrylic', 'Watercolor', 'Charcoal', 'Digital',
  'Mixed Media', 'Sculpture', 'Photography', 'Ink', 'Pastel',
  'Ceramics', 'Printmaking',
];

export interface FeedFilterValues {
  medium?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
  neighborhoods?: string[];
  schools?: string[];
  commissionsOpen?: boolean;
  availability?: 'available' | 'commission';
}

interface FeedFiltersProps {
  filters: FeedFilterValues;
  onFilterChange: (filters: FeedFilterValues) => void;
}

function toggleInList(list: string[] | undefined, value: string): string[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

export function FeedFilters({ filters, onFilterChange }: FeedFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const { data: options } = useFilterOptions();

  const handleSearch = (value: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onFilterChange({ ...filters, search: value || undefined });
    }, 300);
  };

  const activeCount = [
    filters.medium, filters.minPrice, filters.maxPrice, filters.search,
    filters.commissionsOpen, filters.availability,
    filters.neighborhoods?.length, filters.schools?.length,
  ].filter(Boolean).length;

  const selectClass = 'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20';

  return (
    <div className="mb-6 space-y-3">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          defaultValue={filters.search ?? ''}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search art, artists, styles..."
          className="w-full rounded-full border border-line bg-surface py-2 pl-10 pr-4 text-sm text-ink placeholder:text-muted/70 focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
        />
      </div>

      <div className="hidden flex-wrap items-center gap-3 md:flex">
        <select value={filters.medium ?? ''} onChange={(e) => onFilterChange({ ...filters, medium: e.target.value || undefined })} className={selectClass}>
          <option value="">All Mediums</option>
          {MEDIUM_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>

        <select value={filters.availability ?? ''} onChange={(e) => onFilterChange({ ...filters, availability: (e.target.value || undefined) as FeedFilterValues['availability'] })} className={selectClass}>
          <option value="">Any availability</option>
          <option value="available">Available now</option>
          <option value="commission">Commission only</option>
        </select>

        {options?.neighborhoods && options.neighborhoods.length > 0 && (
          <select value="" onChange={(e) => e.target.value && onFilterChange({ ...filters, neighborhoods: toggleInList(filters.neighborhoods, e.target.value) })} className={selectClass}>
            <option value="">Neighborhood{filters.neighborhoods?.length ? ` (${filters.neighborhoods.length})` : ''}</option>
            {options.neighborhoods.map((n) => <option key={n} value={n}>{filters.neighborhoods?.includes(n) ? '✓ ' : ''}{n}</option>)}
          </select>
        )}

        {options?.schools && options.schools.length > 0 && (
          <select value="" onChange={(e) => e.target.value && onFilterChange({ ...filters, schools: toggleInList(filters.schools, e.target.value) })} className={selectClass}>
            <option value="">School{filters.schools?.length ? ` (${filters.schools.length})` : ''}</option>
            {options.schools.map((s) => <option key={s} value={s}>{filters.schools?.includes(s) ? '✓ ' : ''}{s}</option>)}
          </select>
        )}

        <input type="number" placeholder="Min $" value={filters.minPrice ? filters.minPrice / 100 : ''} onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })} className={`w-24 ${selectClass}`} min={0} />
        <span className="text-sm text-muted">to</span>
        <input type="number" placeholder="Max $" value={filters.maxPrice ? filters.maxPrice / 100 : ''} onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })} className={`w-24 ${selectClass}`} min={0} />

        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!filters.commissionsOpen} onChange={(e) => onFilterChange({ ...filters, commissionsOpen: e.target.checked || undefined })} className="rounded border-line" />
          Commissions open
        </label>

        <select value={filters.sort ?? 'recent'} onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FeedFilterValues['sort'] })} className={selectClass}>
          <option value="recent">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="popular">Most Saved</option>
        </select>

        {activeCount > 0 && (
          <button onClick={() => onFilterChange({ search: filters.search })} className="text-sm text-terra hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink md:hidden">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeCount > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-terra text-xs text-white">{activeCount}</span>}
      </button>

      <FilterDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} filters={filters} onFilterChange={onFilterChange} />
    </div>
  );
}
