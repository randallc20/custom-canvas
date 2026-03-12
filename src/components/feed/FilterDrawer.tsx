'use client';

import { Button } from '@/components/ui/Button';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: {
    medium?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: 'recent' | 'price_asc' | 'price_desc' | 'popular';
  };
  onFilterChange: (filters: FilterDrawerProps['filters']) => void;
}

export function FilterDrawer({ isOpen, onClose, filters, onFilterChange }: FilterDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 rounded-t-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Filters</h3>
          <button onClick={onClose} className="text-gray-400">
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
              <option value="Oil Paint">Oil Paint</option>
              <option value="Acrylic">Acrylic</option>
              <option value="Watercolor">Watercolor</option>
              <option value="Digital">Digital</option>
              <option value="Mixed Media">Mixed Media</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sort By</label>
            <select
              value={filters.sort ?? 'recent'}
              onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FilterDrawerProps['filters']['sort'] })}
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
