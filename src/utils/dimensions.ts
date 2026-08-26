// Artwork dimensions are STORED in cm (width_cm/height_cm/depth_cm — no unit
// column). The UI is inches-first for a US audience: forms take inches by
// default and convert at the edge; display shows inches with cm alongside.

export type DimensionUnit = 'in' | 'cm';

export const CM_PER_INCH = 2.54;

/** cm → inches at 2dp: precise enough that in→cm→in round-trips are stable. */
export function cmToIn(cm: number): number {
  return Math.round((cm / CM_PER_INCH) * 100) / 100;
}

/** inches → cm at 1dp, the precision the columns have always held. */
export function inToCm(inches: number): number {
  return Math.round(inches * CM_PER_INCH * 10) / 10;
}

function trim(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** "24 × 36 in (61 × 91.4 cm)" from stored-cm values. */
export function formatDimensionsFromCm(values: (number | null | undefined)[]): string | null {
  const cm = values.filter((v): v is number => v != null && v > 0);
  if (cm.length === 0) return null;
  const inches = cm.map((v) => trim(v / CM_PER_INCH)).join(' × ');
  return `${inches} in (${cm.map(trim).join(' × ')} cm)`;
}
