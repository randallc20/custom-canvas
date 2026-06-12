'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as content from '@/services/artistContent';
import type { ArtistEducation } from '@/types/artist';

export function useEducation(artistId: string) {
  return useQuery({
    queryKey: ['education', artistId],
    queryFn: () => content.getEducation(artistId),
    enabled: !!artistId,
  });
}

export function useSaveEducation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ artistId, entries }: { artistId: string; entries: Array<Omit<ArtistEducation, 'id' | 'artist_id' | 'created_at'> & { id?: string }> }) =>
      content.saveEducation(artistId, entries),
    onSuccess: (_, { artistId }) => queryClient.invalidateQueries({ queryKey: ['education', artistId] }),
  });
}

export function usePersonalPhotos(artistId: string) {
  return useQuery({
    queryKey: ['personal-photos', artistId],
    queryFn: () => content.getPersonalPhotos(artistId),
    enabled: !!artistId,
  });
}

export function useVideos(artistId: string) {
  return useQuery({
    queryKey: ['artist-videos', artistId],
    queryFn: () => content.getVideos(artistId),
    enabled: !!artistId,
  });
}

export function useSeries(artistId: string) {
  return useQuery({
    queryKey: ['series', artistId],
    queryFn: () => content.getSeries(artistId),
    enabled: !!artistId,
  });
}

type ContentResource = 'personal-photos' | 'artist-videos' | 'series' | 'education';

export function useInvalidateArtistContent() {
  const queryClient = useQueryClient();
  return (artistId: string, resource?: ContentResource) => {
    const resources: ContentResource[] = resource
      ? [resource]
      : ['personal-photos', 'artist-videos', 'series', 'education'];
    for (const key of resources) {
      queryClient.invalidateQueries({ queryKey: [key, artistId] });
    }
  };
}

export function useUpdatePinned() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, listingIds }: { slug: string; listingIds: string[] }) =>
      content.updatePinned(slug, listingIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artist'] }),
  });
}
