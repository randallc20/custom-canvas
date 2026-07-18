'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { FilterChip } from '@/components/ui/FilterChip';
import type { Tag, TagCategory } from '@/types/listing';

const CATEGORY_LABELS: Record<TagCategory, string> = {
  medium: 'Medium',
  style: 'Style',
  subject: 'Subject',
  mood: 'Mood',
};
const CATEGORY_ORDER: TagCategory[] = ['style', 'subject', 'mood', 'medium'];
export const MAX_TAGS = 10;

/** Curated-vocabulary tag chips for the listing forms. Tags are what buyers
 *  search by ("landscape", "abstract") — nudge artists to pick a few. */
export function TagPicker({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const { data: tags } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('name');
      if (error) throw error;
      return data as Tag[];
    },
    staleTime: 30 * 60 * 1000,
  });

  if (!tags?.length) return null;

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((t) => t !== name));
    else if (value.length < MAX_TAGS) onChange([...value, name]);
  };

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="block text-sm font-medium text-ink">Tags</label>
        <span className="text-xs text-muted">{value.length}/{MAX_TAGS} — help buyers find this piece</span>
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
        {CATEGORY_ORDER.map((cat) => {
          const group = tags.filter((t) => t.category === cat);
          if (!group.length) return null;
          return (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.map((tag) => (
                  <FilterChip
                    key={tag.id}
                    active={value.includes(tag.name)}
                    onClick={() => toggle(tag.name)}
                  >
                    {tag.name}
                  </FilterChip>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
