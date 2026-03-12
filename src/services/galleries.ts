import { supabase } from '@/lib/supabase';
import { GalleryProfile } from '@/types/gallery';

export async function getGalleryBySlug(slug: string): Promise<GalleryProfile | null> {
  const { data, error } = await supabase
    .from('gallery_profiles')
    .select('*, profile:profiles(*)')
    .eq('slug', slug)
    .single();

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
