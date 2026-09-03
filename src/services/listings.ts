import { supabase } from '@/lib/supabase';
import { Listing, ListingImage, ListingWithImages } from '@/types/listing';
import type { ListingWriteData } from '@/schemas/listingSchema';

export async function getListingById(id: string): Promise<ListingWithImages | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*)), artist:artist_profiles(slug, display_name, fulfillment_pref)')
    .eq('id', id)
    .single();

  if (error) throw error;

  if (data) {
    return {
      ...data,
      tags: data.tags?.map((lt: { tag: unknown }) => lt.tag) ?? [],
    } as ListingWithImages;
  }
  return null;
}

// Listing writes go through API routes (not the client SDK) so the server
// sees publish/price events and can fan out follower/saver emails. RLS
// remains the safety net underneath.
async function listingApi<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Listing request failed');
  }
  return res.json();
}

// The body the route actually accepts: listingWriteSchema strips anything
// else, and artist_id comes from the session there — so the client type must
// not promise the server fields it discards.
export async function createListing(listing: ListingWriteData): Promise<Listing> {
  return listingApi<Listing>('/api/listings', {
    method: 'POST',
    body: JSON.stringify(listing),
  });
}

export async function updateListing(id: string, updates: Partial<Listing>): Promise<Listing> {
  return listingApi<Listing>(`/api/listings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

/** Replace a listing's tag set (curated names → ids). Fires the DB trigger
 *  that refreshes the listing's search vector, so tag words are searchable. */
export async function setListingTags(listingId: string, tagNames: string[]): Promise<void> {
  // Zero rows is legitimate here (listing may have had no tags) — no row
  // assertion; an RLS refusal on the delete would surface on the insert below.
  const { error: clearError } = await supabase
    .from('listing_tags')
    .delete()
    .eq('listing_id', listingId);
  if (clearError) throw clearError;
  if (!tagNames.length) return;
  const { data: tags, error: tagError } = await supabase
    .from('tags')
    .select('id, name')
    .in('name', tagNames);
  if (tagError) throw tagError;
  if (!tags?.length) return;
  const { error } = await supabase
    .from('listing_tags')
    .insert(tags.map((t) => ({ listing_id: listingId, tag_id: t.id })));
  if (error) throw error;
}

export async function deleteListing(id: string): Promise<void> {
  await listingApi<{ success: boolean }>(`/api/listings/${id}`, { method: 'DELETE' });
}

export async function addListingImages(listingId: string, urls: string[], startOrder: number): Promise<ListingImage[]> {
  const { data, error } = await supabase
    .from('listing_images')
    .insert(urls.map((url, i) => ({
      listing_id: listingId,
      image_url: url,
      display_order: startOrder + i,
      is_primary: startOrder + i === 0,
    })))
    .select();

  if (error) throw error;
  return data;
}

export async function updateListingImage(id: string, updates: Partial<Pick<ListingImage, 'display_order' | 'is_primary'>>): Promise<void> {
  const { data, error } = await supabase
    .from('listing_images')
    .update(updates)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  // Zero rows = RLS refused — a reorder would look done but not persist.
  if (!data) throw new Error('Could not update the image — please refresh and try again.');
}

export async function deleteListingImage(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('listing_images')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  // Zero rows = RLS refused — the image would vanish from the UI but survive.
  if (!data) throw new Error('Could not remove the image — please refresh and try again.');
}
