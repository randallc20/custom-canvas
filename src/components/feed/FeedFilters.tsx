'use client';

import { useState, useRef } from 'react';
import { FilterDrawer } from './FilterDrawer';

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
}

interface FeedFiltersProps {
  filters: FeedFilterValues;
  onFilterChange: (filters: FeedFilterValues) => void;
}

export function FeedFilters({ filters, onFilterChange }: FeedFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = (value: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      onFilterChange({ ...filters, search: value || undefined });
    }, 300);
  };

  const activeCount = [filters.medium, filters.minPrice, filters.maxPrice, filters.search].filter(Boolean).length;

  return (
    <div className="mb-6 space-y-3">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          defaultValue={filters.search ?? ''}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search art, artists, styles..."
          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20"
        />
      </div>

      <div className="hidden items-center gap-3 md:flex">
        <select
          value={filters.medium ?? ''}
          onChange={(e) => onFilterChange({ ...filters, medium: e.target.value || undefined })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Mediums</option>
          {MEDIUM_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Min $"
          value={filters.minPrice ? filters.minPrice / 100 : ''}
          onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          min={0}
        />
        <span className="text-sm text-gray-400">to</span>
        <input
          type="number"
          placeholder="Max $"
          value={filters.maxPrice ? filters.maxPrice / 100 : ''}
          onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          min={0}
        />

        <select
          value={filters.sort ?? 'recent'}
          onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FeedFilterValues['sort'] })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="recent">Most Recent</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="popular">Most Popular</option>
        </select>
      </div>

      <button
        onClick={() => setDrawerOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm md:hidden"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {activeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E8704A] text-xs text-white">
            {activeCount}
          </span>
        )}
      </button>

      <FilterDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        filters={filters}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}
