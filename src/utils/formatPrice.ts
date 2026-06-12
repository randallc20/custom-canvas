export function formatPrice(cents: number): string {
  if (cents < 0) return '-' + formatPrice(-cents);
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `$${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
}

interface PriceLabelFields {
  status: string;
  price_cents: number;
  price_visible?: boolean | null;
  sold_price_cents?: number | null;
  show_sold_price?: boolean | null;
}

// Single source of truth for public-facing price text. Sold pieces never
// reveal a price unless the artist opted in; hidden prices stay hidden on
// every surface.
export function listingPriceLabel(listing: PriceLabelFields): string {
  if (listing.status === 'sold') {
    return listing.show_sold_price && listing.sold_price_cents != null
      ? `Sold for ${formatPrice(listing.sold_price_cents)}`
      : 'Sold';
  }
  if (listing.price_visible === false) return 'Contact for price';
  return formatPrice(listing.price_cents);
}
