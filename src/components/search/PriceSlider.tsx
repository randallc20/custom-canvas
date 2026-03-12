'use client';

import { formatPrice } from '@/utils/formatPrice';

interface PriceSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

export function PriceSlider({ min, max, value, onChange }: PriceSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{formatPrice(value[0])}</span>
        <span>{formatPrice(value[1])}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value[0]}
        onChange={(e) => onChange([parseInt(e.target.value, 10), value[1]])}
        className="w-full accent-[#E8704A]"
      />
      <input
        type="range"
        min={min}
        max={max}
        value={value[1]}
        onChange={(e) => onChange([value[0], parseInt(e.target.value, 10)])}
        className="w-full accent-[#E8704A]"
      />
    </div>
  );
}
