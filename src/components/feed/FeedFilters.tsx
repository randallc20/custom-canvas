'use client';

import { useState } from 'react';
import { FilterDrawer } from './FilterDrawer';

interface FeedFiltersProps {
  filters: {
    medium?: string;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
  };
  onFilterChange: (filters: FeedFiltersProps['filters']) => void;
}

export function FeedFilters({ filters, onFilterChange }: FeedFiltersProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mb-6">
      <div className="hidden items-center gap-4 md:flex">
        <select
          value={filters.medium ?? ''}
          onChange={(e) => onFilterChange({ ...filters, medium: e.target.value || undefined })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Mediums</option>
          <option value="Oil Paint">Oil Paint</option>
          <option value="Acrylic">Acrylic</option>
          <option value="Watercolor">Watercolor</option>
          <option value="Digital">Digital</option>
          <option value="Mixed Media">Mixed Media</option>
          <option value="Photography">Photography</option>
          <option value="Sculpture">Sculpture</option>
        </select>

        <select
          value={filters.sort ?? 'recent'}
          onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FeedFiltersProps['filters']['sort'] })}
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
