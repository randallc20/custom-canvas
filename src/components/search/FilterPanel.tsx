'use client';

interface FilterPanelProps {
  filters: { medium?: string; minPrice?: number; maxPrice?: number };
  onFilterChange: (filters: FilterPanelProps['filters']) => void;
}

const MEDIUMS = ['Oil Paint', 'Acrylic', 'Watercolor', 'Charcoal', 'Digital', 'Mixed Media', 'Sculpture', 'Photography'];

export function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-900">Medium</h3>
        <div className="space-y-1">
          {MEDIUMS.map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.medium === m}
                onChange={() => onFilterChange({ ...filters, medium: filters.medium === m ? undefined : m })}
                className="rounded border-gray-300 text-terra focus:ring-terra"
              />
              <span className="text-sm text-gray-700">{m}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-900">Price Range</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.minPrice ? filters.minPrice / 100 : ''}
            onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value ? parseInt(e.target.value, 10) * 100 : undefined })}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="number"
            placeholder="Max"
            value={filters.maxPrice ? filters.maxPrice / 100 : ''}
            onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value ? parseInt(e.target.value, 10) * 100 : undefined })}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
