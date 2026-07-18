// Buyer location resolution — no accounts, no keys, no tracking. The chosen
// city lives in localStorage only; buyers who don't want to share device
// location can type a city or ZIP instead.

export interface BuyerLocation {
  /** City name as matched against artist_profiles.city, e.g. "Houston". */
  city: string;
  /** Display region, e.g. "TX" — cosmetic only. */
  region?: string;
  source: 'zip' | 'city' | 'geolocation';
}

export const LOCATION_STORAGE_KEY = 'cc-buyer-location';

/** US ZIP → city via zippopotam.us (free, keyless, CORS-friendly). */
export async function resolveZip(zip: string): Promise<BuyerLocation | null> {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    return {
      city: place['place name'],
      region: place['state abbreviation'],
      source: 'zip',
    };
  } catch {
    return null;
  }
}

/** Browser geolocation → city via BigDataCloud's keyless client endpoint. */
export async function resolveGeolocation(): Promise<BuyerLocation | null> {
  const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
  if (!coords) return null;
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const city = data.city || data.locality;
    if (!city) return null;
    return { city, region: data.principalSubdivisionCode?.split('-')[1], source: 'geolocation' };
  } catch {
    return null;
  }
}

/** Free-text city entry: "Houston", "houston tx", "Austin, TX". */
export function parseCityInput(input: string): BuyerLocation | null {
  const trimmed = input.trim();
  if (trimmed.length < 2) return null;
  const match = trimmed.match(/^(.+?)(?:[,\s]+([A-Za-z]{2}))?$/);
  if (!match) return null;
  const city = match[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return { city, region: match[2]?.toUpperCase(), source: 'city' };
}

export function formatLocation(loc: BuyerLocation): string {
  return loc.region ? `${loc.city}, ${loc.region}` : loc.city;
}

/** ilike pattern for matching artist_profiles.city (free text): escaped
 *  prefix match, so buyer "Houston" finds artists who typed "Houston",
 *  "Houston, TX", or "Houston Texas" — and wildcard input can't match all. */
export function cityMatchPattern(city: string): string {
  return city.trim().replace(/[%_\\]/g, '\\$&') + '%';
}
