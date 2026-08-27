/** Format a date-only value (away_until etc.) without the UTC shift.
 *  `new Date('2026-04-02')` parses as midnight UTC and renders as April 1
 *  in Chicago — parse the calendar date as LOCAL instead, so the artist's
 *  "back April 2" reads April 2 everywhere. */
export function formatDateOnly(
  value: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
): string {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', options);
}
