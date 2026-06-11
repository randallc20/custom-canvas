import { supabase } from '@/lib/supabase';
import { GalleryProfile } from '@/types/gallery';

export async function getVerifiedGalleries(): Promise<GalleryProfile[]> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .select('*')
    .eq('is_verified', true)
    .order('gallery_name', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getGalleryBySlug(slug: string): Promise<GalleryProfile | null> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

  if (error) throw error;
  return data;
}

export async function getGalleryByProfileId(profileId: string): Promise<GalleryProfile | null> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .select('*')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateGalleryProfile(
  id: string,
  updates: Partial<GalleryProfile>
): Promise<GalleryProfile> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPendingGalleries(): Promise<GalleryProfile[]> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .select('*, profile:profiles(*)')
    .eq('is_verified', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function verifyGallery(galleryId: string, adminId: string): Promise<GalleryProfile> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
      verified_by: adminId,
    })
    .eq('id', galleryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGalleryArtists(galleryId: string) {
  const { data, error } = await supabase
    .from('gallery_artists')
    .select('*, artist:artist_profiles(*, profile:profiles(*))')
    .eq('gallery_id', galleryId)
    .order('added_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addGalleryArtist(galleryId: string, artistId: string, role: string = 'represented') {
  const { data, error } = await supabase
    .from('gallery_artists')
    .insert({ gallery_id: galleryId, artist_id: artistId, role })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeGalleryArtist(galleryId: string, artistId: string) {
  const { error } = await supabase
    .from('gallery_artists')
    .delete()
    .eq('gallery_id', galleryId)
    .eq('artist_id', artistId);

  if (error) throw error;
}
