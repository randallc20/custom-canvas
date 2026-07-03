import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPartnerPicksShelf,
  getGalleryPicksManage,
  addPick,
  removePick,
  updatePick,
} from '@/services/partnerPicks';

export function usePartnerPicksShelf() {
  return useQuery({
    queryKey: ['partner-picks', 'shelf'],
    queryFn: () => getPartnerPicksShelf(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useGalleryPicks(galleryId: string) {
  return useQuery({
    queryKey: ['partner-picks', 'manage', galleryId],
    queryFn: () => getGalleryPicksManage(galleryId),
    enabled: !!galleryId,
  });
}

export function useAddPick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ galleryId, listingId, displayOrder }: { galleryId: string; listingId: string; displayOrder: number }) =>
      addPick(galleryId, listingId, displayOrder),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-picks'] }),
  });
}

export function useRemovePick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ galleryId, listingId }: { galleryId: string; listingId: string }) =>
      removePick(galleryId, listingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-picks'] }),
  });
}

export function useUpdatePick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ galleryId, listingId, updates }: {
      galleryId: string;
      listingId: string;
      updates: { display_order?: number; blurb?: string | null };
    }) => updatePick(galleryId, listingId, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-picks'] }),
  });
}
