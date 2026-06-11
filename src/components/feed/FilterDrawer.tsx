'use client';

import { Button } from '@/components/ui/Button';
import { MEDIUM_OPTIONS, type FeedFilterValues } from './FeedFilters';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FeedFilterValues;
  onFilterChange: (filters: FeedFilterValues) => void;
}

export function FilterDrawer({ isOpen, onClose, filters, onFilterChange }: FilterDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Filters</h3>
          <button onClick={onClose} className="text-gray-400" aria-label="Close filters">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Medium</label>
            <select
              value={filters.medium ?? ''}
              onChange={(e) => onFilterChange({ ...filters, medium: e.target.value || undefined })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">All Mediums</option>
              {MEDIUM_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Price Range</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min $"
                value={filters.minPrice ? filters.minPrice / 100 : ''}
                onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                min={0}
              />
              <span className="text-sm text-gray-400">to</span>
              <input
                type="number"
                placeholder="Max $"
                value={filters.maxPrice ? filters.maxPrice / 100 : ''}
                onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                min={0}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sort By</label>
            <select
              value={filters.sort ?? 'recent'}
              onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FeedFilterValues['sort'] })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="recent">Most Recent</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="popular">Most Popular</option>
            </select>
          </div>

          <Button onClick={onClose} className="w-full">Apply Filters</Button>
        </div>
      </div>
    </div>
  );
}
