'use client';

import { useState } from 'react';
import type { UseFormGetValues, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { Input } from '@/components/ui/Input';
import { numberOrNull } from '@/utils/formNumber';
import { cmToIn, inToCm, type DimensionUnit } from '@/utils/dimensions';
import type { ListingFormData } from '@/schemas/listingSchema';

const DIM_FIELDS = ['width_cm', 'height_cm', 'depth_cm'] as const;

/**
 * The dimension inputs hold whatever unit is selected — inches by default,
 * this is a US marketplace — while the columns store cm. The hook owns the
 * toggle (converting what's typed) and the submit-time conversion; the
 * fieldset renders the toggle + inputs. Shared by the create and edit forms
 * so the two can't drift.
 */
export function useDimensionUnit(
  getValues: UseFormGetValues<ListingFormData>,
  setValue: UseFormSetValue<ListingFormData>
) {
  const [unit, setUnit] = useState<DimensionUnit>('in');

  const switchUnit = (to: DimensionUnit) => {
    if (to === unit) return;
    const convert = to === 'cm' ? inToCm : cmToIn;
    DIM_FIELDS.forEach((f) => {
      const v = getValues(f);
      if (v != null) setValue(f, convert(v));
    });
    setUnit(to);
  };

  /**
   * Convert a submitted dimension to the cm the columns store. Pass the
   * originally-stored cm (edit form) so an untouched field keeps its exact
   * stored value — the 2dp-in/1dp-cm round-trip would otherwise rewrite
   * legacy precision (30.48 → 30.5) on saves that never touched dimensions.
   */
  const toCm = (v: number | null | undefined, originalCm?: number | null) => {
    if (v == null) return null;
    if (
      originalCm != null &&
      (v === cmToIn(originalCm) ||
        (unit === 'cm' && (v === originalCm || v === inToCm(cmToIn(originalCm)))))
    ) {
      return originalCm;
    }
    return unit === 'in' ? inToCm(v) : v;
  };

  return { unit, switchUnit, toCm };
}

export function DimensionsFieldset({
  unit,
  onSwitch,
  register,
}: {
  unit: DimensionUnit;
  onSwitch: (to: DimensionUnit) => void;
  register: UseFormRegister<ListingFormData>;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Dimensions</span>
        <div className="flex overflow-hidden rounded-lg border border-line text-xs">
          {(['in', 'cm'] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onSwitch(u)}
              aria-pressed={unit === u}
              className={`px-3 py-1 font-medium transition-colors ${
                unit === u ? 'bg-terraText text-white' : 'bg-surface text-muted hover:bg-sand/50'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Input label={`Width (${unit})`} type="number" step="0.1" {...register('width_cm', { setValueAs: numberOrNull })} />
        <Input label={`Height (${unit})`} type="number" step="0.1" {...register('height_cm', { setValueAs: numberOrNull })} />
        <Input label={`Depth (${unit})`} type="number" step="0.1" {...register('depth_cm', { setValueAs: numberOrNull })} />
      </div>
    </div>
  );
}
