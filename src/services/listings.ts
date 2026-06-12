import { supabase } from '@/lib/supabase';
import { Listing, ListingWithImages } from '@/types/listing';

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

export async function createListing(listing: Omit<Listing, 'id' | 'view_count' | 'save_count' | 'search_vector' | 'created_at' | 'updated_at'>): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .insert(listing)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateListing(id: string, updates: Partial<Listing>): Promise<Listing> {
  const { data, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase
    .from('listings')
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
