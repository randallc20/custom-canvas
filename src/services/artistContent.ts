import { supabase } from '@/lib/supabase';
import type {
  ArtistEducation,
  ArtistPersonalPhoto,
  ArtistVideo,
  ListingSeries,
} from '@/types/artist';

// --- Education ---

export async function getEducation(artistId: string): Promise<ArtistEducation[]> {
  const { data, error } = await supabase
    .from('artist_education')
    .select('*')
    .eq('artist_id', artistId)
    .order('display_order');
  if (error) throw error;
  return data ?? [];
}

export async function saveEducation(
  artistId: string,
  entries: Array<Omit<ArtistEducation, 'id' | 'artist_id' | 'created_at'> & { id?: string }>
): Promise<void> {
  // Replace-all: simplest correct sync for a small repeatable fieldset.
  const { error: delError } = await supabase.from('artist_education').delete().eq('artist_id', artistId);
  if (delError) throw delError;
  if (entries.length === 0) return;
  const { error } = await supabase.from('artist_education').insert(
    entries.map((e, i) => ({
      artist_id: artistId,
      institution: e.institution,
      degree: e.degree || null,
      field_of_study: e.field_of_study || null,
      start_year: e.start_year ?? null,
      end_year: e.end_year ?? null,
      is_current: e.is_current ?? false,
      display_order: i,
    }))
  );
  if (error) throw error;
  // Auto-link entries whose institution matches a verified partner.
  await supabase.rpc('link_education_partners');
}

// --- Personal photos ---

export async function getPersonalPhotos(artistId: string): Promise<ArtistPersonalPhoto[]> {
  const { data, error } = await supabase
    .from('artist_personal_photos')
    .select('*')
    .eq('artist_id', artistId)
    .order('display_order');
  if (error) throw error;
  return data ?? [];
}

export async function addPersonalPhotos(artistId: string, imageUrls: string[], startOrder: number): Promise<void> {
  if (imageUrls.length === 0) return;
  const { error } = await supabase.from('artist_personal_photos').insert(
    imageUrls.map((url, i) => ({ artist_id: artistId, image_url: url, display_order: startOrder + i }))
  );
  if (error) throw error;
}

export async function updatePersonalPhoto(id: string, updates: { caption?: string | null; display_order?: number }): Promise<void> {
  const { error } = await supabase.from('artist_personal_photos').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deletePersonalPhoto(id: string): Promise<void> {
  const { error } = await supabase.from('artist_personal_photos').delete().eq('id', id);
  if (error) throw error;
}

// --- Videos ---

export async function getVideos(artistId: string): Promise<ArtistVideo[]> {
  const { data, error } = await supabase
    .from('artist_videos')
    .select('*')
    .eq('artist_id', artistId)
    .order('display_order');
  if (error) throw error;
  return data ?? [];
}

export async function addVideo(
  artistId: string,
  video: { video_url: string; thumbnail_url: string | null; display_order: number }
): Promise<void> {
  const { error } = await supabase.from('artist_videos').insert({ artist_id: artistId, ...video });
  if (error) throw error;
}

export async function updateVideo(id: string, updates: { title?: string | null; description?: string | null; display_order?: number }): Promise<void> {
  const { error } = await supabase.from('artist_videos').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await supabase.from('artist_videos').delete().eq('id', id);
  if (error) throw error;
}

// --- Series ---

export async function getSeries(artistId: string): Promise<ListingSeries[]> {
  const { data, error } = await supabase
    .from('listing_series')
    .select('*')
    .eq('artist_id', artistId)
    .order('display_order');
  if (error) throw error;
  return data ?? [];
}

export async function createSeries(
  artistId: string,
  series: { name: string; description?: string | null; cover_image_url?: string | null; display_order: number }
): Promise<ListingSeries> {
  const { data, error } = await supabase
    .from('listing_series')
    .insert({ artist_id: artistId, ...series })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSeries(
  id: string,
  updates: { name?: string; description?: string | null; cover_image_url?: string | null; display_order?: number }
): Promise<void> {
  const { error } = await supabase.from('listing_series').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteSeries(id: string): Promise<void> {
  // Listings keep existing but leave the series.
  const { error: clearError } = await supabase.from('listings').update({ series_id: null }).eq('series_id', id);
  if (clearError) throw clearError;
  const { error } = await supabase.from('listing_series').delete().eq('id', id);
  if (error) throw error;
}

// --- Pinned work (server-validated: max 3 + ownership) ---

export async function updatePinned(slug: string, listingIds: string[]): Promise<void> {
  const response = await fetch(`/api/artists/${slug}/pinned`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned_listing_ids: listingIds }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to update pinned work');
  }
}
