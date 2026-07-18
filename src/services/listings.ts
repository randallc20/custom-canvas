import { supabase } from '@/lib/supabase';
import { Listing, ListingImage, ListingWithImages } from '@/types/listing';

export async function getListingById(id: string): Promise<ListingWithImages | null> {
  const { data, error } = await supabase
    .from('listings')
    .select('*, images:listing_images(*), tags:listing_tags(tag:tags(*)), artist:artist_profiles(slug, fulfillment_pref)')
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

export async function createListing(listing: Omit<Listing, 'id' | 'view_count' | 'save_count' | 'search_vector' | 'created_at' | 'updated_at'>): Promise<Listing> {
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
  const { error } = await supabase
    .from('listing_images')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteListingImage(id: string): Promise<void> {
  const { error } = await supabase
    .from('listing_images')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function getListingImages(listingId: string) {
  const { data, error } = await supabase
    .from('listing_images')
    .select('*')
    .eq('listing_id', listingId)
    .order('display_order');

  if (error) throw error;
  return data;
}
