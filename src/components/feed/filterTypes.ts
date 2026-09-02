// Shared vocabulary for the feed filters. Lives outside FeedFilters.tsx so the
// desktop row and the mobile drawer can both import it without a cycle.

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

export function toggleInList(list: string[] | undefined, value: string): string[] {
  const set = new Set(list ?? []);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return Array.from(set);
}

/** Everything except the search box, which has its own visible control. */
export function activeFilterCount(filters: FeedFilterValues): number {
  return [
    filters.medium, filters.minPrice, filters.maxPrice, filters.search,
    filters.commissionsOpen, filters.availability,
    filters.neighborhoods?.length, filters.schools?.length,
  ].filter(Boolean).length;
}
