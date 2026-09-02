'use client';

const MEDIUM_OPTIONS = [
  'Oil Paint', 'Acrylic', 'Watercolor', 'Gouache', 'Charcoal', 'Ink',
  'Pastel', 'Colored Pencil', 'Printmaking', 'Photography', 'Digital',
  'Mixed Media', 'Collage', 'Sculpture', 'Ceramics', 'Fiber & Textile',
  'Wood', 'Metal', 'Glass', 'Mural',
];

interface MediumsChipsProps {
  value: string[];
  onChange: (mediums: string[]) => void;
  max?: number;
}

export function MediumsChips({ value, onChange, max = 10 }: MediumsChipsProps) {
  const toggle = (medium: string) => {
    if (value.includes(medium)) {
      onChange(value.filter((m) => m !== medium));
    } else if (value.length < max) {
      onChange([...value, medium]);
    }
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">Primary mediums</p>
      <div className="flex flex-wrap gap-2">
        {MEDIUM_OPTIONS.map((medium) => {
          const selected = value.includes(medium);
          return (
            <button
              key={medium}
              type="button"
              onClick={() => toggle(medium)}
              aria-pressed={selected}
              className={`rounded-full px-3 py-1 text-sm transition-colors duration-150
                ${selected ? 'bg-terraText text-white' : 'bg-sand text-muted hover:text-ink'}`}
            >
              {medium}
            </button>
          );
        })}
      </div>
    </div>
  );
}
