'use client';

import { Select } from '@/components/ui/Select';
import { useFilterOptions } from '@/hooks/useFeed';
import {
  MEDIUM_OPTIONS,
  activeFilterCount,
  toggleInList,
  type FeedFilterValues,
} from './filterTypes';
import { useMature } from '@/context/MatureContext';

interface FilterControlsProps {
  filters: FeedFilterValues;
  /** Effective community scope (respects the Everywhere toggle). */
  city?: string;
  onFilterChange: (filters: FeedFilterValues) => void;
  /** 'row' is the desktop bar, 'stacked' is the mobile drawer. */
  layout: 'row' | 'stacked';
}

/**
 * The single definition of the feed's filter set. The desktop bar and the
 * mobile drawer both render THIS — the drawer used to reimplement three of the
 * seven controls and offered no Clear, so a link shared with a neighborhood
 * filter was invisible and unremovable on a phone. One component, two layouts,
 * so the two surfaces cannot drift apart again.
 */
export function FilterControls({ filters, city, onFilterChange, layout }: FilterControlsProps) {
  const { data: options } = useFilterOptions(city);
  const { showMature, setShowMature } = useMature();
  const stacked = layout === 'stacked';
  const hideLabel = !stacked;
  const wrapperClass = stacked ? 'w-full' : 'w-auto';
  const selectClass = stacked ? '' : 'w-auto';
  const numberClass =
    'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20';
  const activeCount = activeFilterCount(filters);

  return (
    <div className={stacked ? 'space-y-4' : 'flex flex-wrap items-center gap-3'}>
      <Select
        label="Medium"
        hideLabel={hideLabel}
        wrapperClassName={wrapperClass}
        className={selectClass}
        value={filters.medium ?? ''}
        onChange={(e) => onFilterChange({ ...filters, medium: e.target.value || undefined })}
      >
        <option value="">All Mediums</option>
        {MEDIUM_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
      </Select>

      <Select
        label="Availability"
        hideLabel={hideLabel}
        wrapperClassName={wrapperClass}
        className={selectClass}
        value={filters.availability ?? ''}
        onChange={(e) => onFilterChange({ ...filters, availability: (e.target.value || undefined) as FeedFilterValues['availability'] })}
      >
        <option value="">Any availability</option>
        <option value="available">Available now</option>
        <option value="commission">Commission only</option>
      </Select>

      {options?.neighborhoods && options.neighborhoods.length > 0 && (
        <Select
          label="Neighborhood"
          hideLabel={hideLabel}
          wrapperClassName={wrapperClass}
          className={selectClass}
          value=""
          onChange={(e) => e.target.value && onFilterChange({ ...filters, neighborhoods: toggleInList(filters.neighborhoods, e.target.value) })}
        >
          <option value="">Neighborhood{filters.neighborhoods?.length ? ` (${filters.neighborhoods.length})` : ''}</option>
          {options.neighborhoods.map((n) => (
            <option key={n} value={n}>{filters.neighborhoods?.includes(n) ? '✓ ' : ''}{n}</option>
          ))}
        </Select>
      )}

      {options?.schools && options.schools.length > 0 && (
        <Select
          label="School"
          hideLabel={hideLabel}
          wrapperClassName={wrapperClass}
          className={selectClass}
          value=""
          onChange={(e) => e.target.value && onFilterChange({ ...filters, schools: toggleInList(filters.schools, e.target.value) })}
        >
          <option value="">School{filters.schools?.length ? ` (${filters.schools.length})` : ''}</option>
          {options.schools.map((s) => (
            <option key={s} value={s}>{filters.schools?.includes(s) ? '✓ ' : ''}{s}</option>
          ))}
        </Select>
      )}

      <div className={stacked ? '' : 'contents'}>
        {stacked && <p className="mb-1 block text-sm font-medium text-ink">Price Range</p>}
        <div className={stacked ? 'flex items-center gap-2' : 'contents'}>
          <input
            type="number"
            aria-label="Minimum price in dollars"
            placeholder="Min $"
            value={filters.minPrice ? filters.minPrice / 100 : ''}
            onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
            className={`${stacked ? 'w-full' : 'w-24'} ${numberClass}`}
            min={0}
          />
          <span className="text-sm text-muted">to</span>
          <input
            type="number"
            aria-label="Maximum price in dollars"
            placeholder="Max $"
            value={filters.maxPrice ? filters.maxPrice / 100 : ''}
            onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined })}
            className={`${stacked ? 'w-full' : 'w-24'} ${numberClass}`}
            min={0}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={!!filters.commissionsOpen}
          onChange={(e) => onFilterChange({ ...filters, commissionsOpen: e.target.checked || undefined })}
          className="rounded border-line"
        />
        Commissions open
      </label>

      {/* Ruling D8. Not part of FeedFilterValues: it is a standing preference
          in this browser, not a filter that belongs in a shareable URL — a
          link with "show mature" baked into it would opt the recipient in. */}
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={showMature}
          onChange={(e) => setShowMature(e.target.checked)}
          className="rounded border-line"
        />
        Show mature work
      </label>

      <Select
        label="Sort by"
        hideLabel={hideLabel}
        wrapperClassName={wrapperClass}
        className={selectClass}
        value={filters.sort ?? 'recent'}
        onChange={(e) => onFilterChange({ ...filters, sort: e.target.value as FeedFilterValues['sort'] })}
      >
        <option value="recent">Newest</option>
        <option value="price_asc">Price: Low to High</option>
        <option value="price_desc">Price: High to Low</option>
        <option value="popular">Most Saved</option>
      </Select>

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onFilterChange({ search: filters.search })}
          className="text-left text-sm text-terraText hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
