import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import type { ListingFormData } from '@/schemas/listingSchema';
import { useDimensionUnit } from '@/components/listing/DimensionsFieldset';
import { CM_PER_INCH, cmToIn, inToCm, formatDimensionsFromCm } from './dimensions';

// Dimensions are STORED in cm; the forms are inches-first and convert at the
// edge. The edit page's comment records the bug this pins: a repaint that
// showed inch values while the unit said cm shrank stored dimensions by
// 2.54× on the next save. Nothing tested the round trip. (05-P3 "tests",
// item 5.)

describe('cmToIn / inToCm at the stored precision', () => {
  it('converts at 2.54 cm per inch', () => {
    expect(CM_PER_INCH).toBe(2.54);
    expect(inToCm(1)).toBe(2.5); // 2.54 rounded to the columns' 1dp
    expect(cmToIn(2.54)).toBe(1);
  });

  // in → cm (1dp) → in (2dp) is stable only WITHIN the stored precision:
  // 24 in → 61 cm (60.96 rounded to the columns' 1dp) → 24.02 in. The
  // function's doc comment calls this "stable"; the real bound is ±0.02 in,
  // which is what a unit toggle can move a typed value by. Pinned as the
  // bound, not as equality, so a precision change has to argue with a number.
  it('in → cm → in stays within 0.02 in for realistic artwork sizes', () => {
    const inches = [1, 2.5, 4, 5.5, 8, 8.5, 9, 11, 12, 14, 16, 18, 20, 22, 24, 30, 36, 40, 48, 60, 72];
    for (const v of inches) {
      const back = cmToIn(inToCm(v));
      // toBeCloseTo(v, 2) is |diff| < 0.005, too tight; compare the rounded
      // hundredths of the drift instead (float subtraction of 0.02 is not 0.02).
      expect(Math.round(Math.abs(back - v) * 100), `${v} in drifted ${(back - v).toFixed(2)} in`).toBeLessThanOrEqual(2);
    }
    // The exact cases, spelled out so a regression cannot hide inside the bound.
    expect(cmToIn(inToCm(24))).toBe(24.02);
    expect(cmToIn(inToCm(36))).toBe(35.98);
    expect(cmToIn(inToCm(20))).toBe(20);
  });

  // The direction that decides whether stored data survives an edit-form
  // round trip. This one IS exact for every value at the stored 1dp.
  it('cm → in → cm round-trips exactly for values already at the stored 1dp', () => {
    const cm = [2.5, 10, 15.2, 20, 30.5, 45.7, 50, 61, 76.2, 91.4, 100, 121.9, 152.4];
    for (const v of cm) {
      expect(inToCm(cmToIn(v)), `${v} cm did not survive the round trip`).toBe(v);
    }
  });

  // Legacy 2dp cm values (imported/older rows) do NOT survive: 30.48 → 12 in
  // → 30.5 cm. This is why the edit form's toCm keeps the original when the
  // field was not touched. The loss is 0.02 cm, and it is deliberate.
  it('legacy 2dp cm values re-quantise to 1dp (why toCm keeps the original)', () => {
    expect(cmToIn(30.48)).toBe(12);
    expect(inToCm(cmToIn(30.48))).toBe(30.5);
    expect(inToCm(cmToIn(30.48))).not.toBe(30.48);
  });

  it('never re-applies the factor (the 2.54× shrink)', () => {
    // The shipped bug: an inch value treated as cm, or a cm value converted
    // again. Both show up as a 2.54× gap from the truth.
    const stored = 61; // a 24-inch piece, stored at the columns' 1dp
    expect(cmToIn(stored)).toBe(24.02);
    expect(inToCm(cmToIn(stored))).toBe(stored);
    // The shrink, if it ever returns: a second conversion lands ~2.54× low.
    expect(stored / cmToIn(cmToIn(stored))).toBeCloseTo(CM_PER_INCH * CM_PER_INCH, 1);
  });

  it('handles zero and small values without NaN', () => {
    expect(cmToIn(0)).toBe(0);
    expect(inToCm(0)).toBe(0);
    expect(inToCm(0.5)).toBe(1.3);
    expect(cmToIn(0.1)).toBe(0.04);
  });

  it('formatDimensionsFromCm renders inches first with cm alongside', () => {
    expect(formatDimensionsFromCm([61, 91.4])).toBe('24 × 36 in (61 × 91.4 cm)');
    expect(formatDimensionsFromCm([61, 91.4, 3.8])).toBe('24 × 36 × 1.5 in (61 × 91.4 × 3.8 cm)');
    expect(formatDimensionsFromCm([61, null, 0])).toBe('24 in (61 cm)');
    expect(formatDimensionsFromCm([null, undefined])).toBeNull();
    expect(formatDimensionsFromCm([])).toBeNull();
  });
});

/**
 * `toCm` lives on `useDimensionUnit`, so exercising it needs a React render.
 * There is no jsdom or testing-library in this repo (and no installing one),
 * so the probe below renders a null component with react-dom/server purely to
 * capture the hook's return value. That reaches the hook's INITIAL unit —
 * 'in', which is both the default and the unit the edit page's 2.54× shrink
 * happened under. The 'cm' branch needs a state update a server render cannot
 * do; its arithmetic is `identity` (a cm value is already stored-cm) plus the
 * same round-trip identities asserted above.
 */
function captureToCm(): ReturnType<typeof useDimensionUnit>['toCm'] {
  let api: ReturnType<typeof useDimensionUnit> | null = null;
  const noop = (() => undefined) as unknown as UseFormGetValues<ListingFormData>;
  const noopSet = (() => undefined) as unknown as UseFormSetValue<ListingFormData>;
  const Probe = () => {
    api = useDimensionUnit(noop, noopSet);
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  if (!api) throw new Error('probe never rendered');
  return (api as ReturnType<typeof useDimensionUnit>).toCm;
}

describe('useDimensionUnit().toCm — the edit page path', () => {
  it('converts a typed inch value to stored cm (create form: no original)', () => {
    const toCm = captureToCm();
    expect(toCm(24)).toBe(61);
    expect(toCm(36)).toBe(91.4);
    expect(toCm(null)).toBeNull();
    expect(toCm(undefined)).toBeNull();
  });

  it('keeps the exact stored cm when the field was never touched', () => {
    const toCm = captureToCm();
    // The edit form seeds the input with cmToIn(stored). Submitting that
    // untouched value must return the ORIGINAL cm, not the re-quantised one:
    // 30.48 → 12 in → (naively) 30.5, silently rewriting legacy precision.
    expect(toCm(cmToIn(30.48), 30.48)).toBe(30.48);
    expect(toCm(cmToIn(91.44), 91.44)).toBe(91.44);
    expect(toCm(cmToIn(61), 61)).toBe(61);
  });

  it('converts a genuinely edited value even when an original exists', () => {
    const toCm = captureToCm();
    expect(toCm(25, 61)).toBe(63.5); // 24 in → 25 in
    expect(toCm(12.5, 30.48)).toBe(31.8);
  });

  it('a stored value with no dimension edit survives save → reload → save', () => {
    const toCm = captureToCm();
    let stored: number | null = 30.48;
    for (let i = 0; i < 5; i++) {
      const shown = stored != null ? cmToIn(stored) : null; // what the edit form seeds
      stored = toCm(shown, stored);
    }
    expect(stored).toBe(30.48);
  });
});
