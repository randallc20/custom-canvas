'use client';

// 16 curated swatches — warm-leaning, all dark enough for white text on CTAs.
const SWATCHES = [
  '#E8704A', // terracotta (brand)
  '#C95A38', // deep terracotta
  '#B7472A', // brick
  '#A0522D', // sienna
  '#C2703D', // copper
  '#D29B43', // ochre
  '#7C8B6F', // sage
  '#4F6B4E', // forest
  '#2F6F6A', // teal
  '#356A8C', // lake blue
  '#3E5C9A', // cobalt
  '#5B4E8C', // violet
  '#8C4E6E', // plum
  '#B5485D', // raspberry
  '#705C4E', // walnut
  '#2D2A26', // ink
];

interface AccentPaletteProps {
  value: string;
  onChange: (color: string) => void;
}

export function AccentPalette({ value, onChange }: AccentPaletteProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">Accent color</p>
      <div className="grid grid-cols-8 gap-2">
        {SWATCHES.map((color) => {
          const selected = value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              aria-label={`Accent color ${color}`}
              aria-pressed={selected}
              className={`h-9 w-9 rounded-full transition-transform duration-150 hover:scale-110
                ${selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-cream' : ''}`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Used on your profile&apos;s buttons, tabs and badges.</p>
    </div>
  );
}
