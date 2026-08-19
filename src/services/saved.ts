import { supabase } from '@/lib/supabase';
import { ListingWithImages } from '@/types/listing';

export async function getSavedListings(profileId: string): Promise<ListingWithImages[]> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('listing:listings(*, images:listing_images(*), tags:listing_tags(tag:tags(*)))')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data
    // A saved listing can go dark (artist unpublished/rejected — RLS hides
    // it); the row comes back with listing:null and must not crash the page.
    ?.filter((s) => s.listing)
    .map((s) => ({
    ...(s.listing as unknown as Record<string, unknown>),
    tags: ((s.listing as unknown as Record<string, unknown>)?.tags as Array<{ tag: unknown }>)?.map((lt) => lt.tag) ?? [],
  })) ?? []) as ListingWithImages[];
}

export async function saveListing(profileId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_listings')
    .insert({ profile_id: profileId, listing_id: listingId });

  if (error) throw error;
}

export async function unsaveListing(profileId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_listings')
    .delete()
    .eq('profile_id', profileId)
    .eq('listing_id', listingId);

  if (error) throw error;
}

export async function isListingSaved(profileId: string, listingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('profile_id')
    .eq('profile_id', profileId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
