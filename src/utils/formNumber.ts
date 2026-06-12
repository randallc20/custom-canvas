// react-hook-form's valueAsNumber turns an empty input into NaN, which zod
// rejects even for optional fields. Use { setValueAs: numberOrNull } on
// every numeric input whose schema is optional/nullable.
export function numberOrNull(value: unknown): number | null {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}
