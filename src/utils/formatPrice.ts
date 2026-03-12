export function formatPrice(cents: number): string {
  if (cents < 0) return '-' + formatPrice(-cents);
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}
