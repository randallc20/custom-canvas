import { supabase } from '@/lib/supabase';
import { withSessionRetry, isRlsDenial } from '@/lib/sessionRetry';
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
  // A heart is often the first write a brand-new account makes; near signup
  // the session cookie may not be attached yet and RLS refuses the insert
  // (CONVENTIONS rule 3), so re-sync the session and retry once.
  const { error } = await withSessionRetry(
    () => supabase.from('saved_listings').insert({ profile_id: profileId, listing_id: listingId }),
    (r) => isRlsDenial(r.error)
  );

  if (error) throw error;
}

export async function unsaveListing(profileId: string, listingId: string): Promise<void> {
  const { data, error } = await withSessionRetry(
    () => supabase
      .from('saved_listings')
      .delete()
      .eq('profile_id', profileId)
      .eq('listing_id', listingId)
      .select('listing_id'),
    (r) => !r.error && !r.data?.length
  );

  if (error) throw error;
  // Zero rows = RLS refused the delete (or state is stale) — the heart would
  // un-fill while the save silently survived.
  if (!data?.length) throw new Error('Could not remove the save — please refresh and try again.');
}

/** Just the ids, for the shared saved-state set the feed cards read. */
export async function getSavedListingIds(profileId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('saved_listings')
    .select('listing_id')
    .eq('profile_id', profileId);

  if (error) throw error;
  return (data ?? []).map((row) => row.listing_id as string);
}
