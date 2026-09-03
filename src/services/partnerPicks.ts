import { supabase } from '@/lib/supabase';
import { ListingWithImages } from '@/types/listing';

export const PARTNER_PICKS_CAP = 6;
const SHELF_MIN_PICKS = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PartnerPicksShelf {
  galleryName: string;
  gallerySlug: string;
  listings: ListingWithImages[];
}

/** Homepage shelf: one verified partner per week (rotating deterministically
 *  among partners with enough live picks). Fails soft to null. */
export async function getPartnerPicksShelf(
  weekSeed?: number,
  showMature = false
): Promise<PartnerPicksShelf | null> {
  let q = supabase
    .from('partner_picks')
    .select(
      'gallery_id, display_order, gallery:gallery_profiles!inner(gallery_name, slug, is_verified), listing:listings!inner(*, images:listing_images(*), artist:artist_profiles(slug, display_name))'
    )
    .eq('gallery_profiles.is_verified', true)
    .eq('listings.status', 'available')
    .order('display_order', { ascending: true });
  // Ruling D8, same reasoning as the featured shelf.
  if (!showMature) q = q.eq('listings.is_mature', false);
  const { data, error } = await q;
  if (error || !data) return null;

  const byGallery = new Map<string, { name: string; slug: string; listings: ListingWithImages[] }>();
  for (const row of data) {
    const gallery = row.gallery as unknown as { gallery_name: string; slug: string };
    const entry = byGallery.get(row.gallery_id) ?? {
      name: gallery.gallery_name,
      slug: gallery.slug,
      listings: [],
    };
    entry.listings.push(row.listing as unknown as ListingWithImages);
    byGallery.set(row.gallery_id, entry);
  }

  const eligible = Array.from(byGallery.entries())
    .filter(([, g]) => g.listings.length >= SHELF_MIN_PICKS)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!eligible.length) return null;

  const week = weekSeed ?? Math.floor(Date.now() / WEEK_MS);
  const [, chosen] = eligible[week % eligible.length];
  return { galleryName: chosen.name, gallerySlug: chosen.slug, listings: chosen.listings.slice(0, 8) };
}

// ---- Partner curation (dashboard) ----

export interface PickRow {
  gallery_id: string;
  listing_id: string;
  blurb: string | null;
  display_order: number;
  // Null when the listing is hidden from this viewer.
  listing: {
    id: string;
    title: string;
    price_cents: number;
    status: string;
    artist: { display_name: string } | null;
    images: { image_url: string; is_primary: boolean }[];
  } | null;
}

export async function getGalleryPicksManage(galleryId: string): Promise<PickRow[]> {
  const { data, error } = await supabase
    .from('partner_picks')
    .select('gallery_id, listing_id, blurb, display_order, listing:listings(id, title, price_cents, status, artist:artist_profiles(display_name), images:listing_images(image_url, is_primary))')
    .eq('gallery_id', galleryId)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PickRow[];
}

export async function addPick(galleryId: string, listingId: string, displayOrder: number): Promise<void> {
  const { error } = await supabase
    .from('partner_picks')
    .insert({ gallery_id: galleryId, listing_id: listingId, display_order: displayOrder });
  if (error) throw error;
}

export async function removePick(galleryId: string, listingId: string): Promise<void> {
  const { data, error } = await supabase
    .from('partner_picks')
    .delete()
    .eq('gallery_id', galleryId)
    .eq('listing_id', listingId)
    .select('listing_id');
  if (error) throw error;
  // RLS silently matches 0 rows when verification was revoked mid-session.
  if (!data?.length) throw new Error('Pick could not be removed — your verification may have changed.');
}

export async function updatePick(
  galleryId: string,
  listingId: string,
  updates: { display_order?: number; blurb?: string | null }
): Promise<void> {
  const { data, error } = await supabase
    .from('partner_picks')
    .update(updates)
    .eq('gallery_id', galleryId)
    .eq('listing_id', listingId)
    .select('listing_id');
  if (error) throw error;
  if (!data?.length) throw new Error('Pick could not be updated — your verification may have changed.');
}

export async function searchPickableListings(
  term: string,
  excludeIds: string[]
): Promise<{ id: string; title: string; price_cents: number; artist: { display_name: string } | null }[]> {
  let query = supabase
    .from('listings')
    .select('id, title, price_cents, artist:artist_profiles(display_name)')
    .eq('status', 'available')
    .ilike('title', `%${term}%`)
    .limit(8);
  if (excludeIds.length) query = query.not('id', 'in', `(${excludeIds.join(',')})`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as {
    id: string; title: string; price_cents: number; artist: { display_name: string } | null;
  }[];
}
