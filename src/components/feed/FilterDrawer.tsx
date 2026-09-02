'use client';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { FilterControls } from './FilterControls';
import type { FeedFilterValues } from './filterTypes';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FeedFilterValues;
  city?: string;
  onFilterChange: (filters: FeedFilterValues) => void;
}

/** The phone-sized face of the feed filters. Body is FilterControls — the same
 *  component the desktop row renders — so the two cannot fall out of sync. */
export function FilterDrawer({ isOpen, onClose, filters, city, onFilterChange }: FilterDrawerProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      closeLabel="Close filters"
      containerClassName="fixed inset-0 z-50 md:hidden"
      overlayClassName="fixed inset-0 animate-fade-in bg-ink/40"
      panelClassName="fixed inset-x-0 bottom-0 z-10 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-surface p-6"
    >
      <div className="space-y-4">
        <FilterControls layout="stacked" filters={filters} city={city} onFilterChange={onFilterChange} />
        <Button onClick={onClose} className="w-full">Apply Filters</Button>
      </div>
    </Modal>
  );
}
