'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PartnerType } from '@/types/gallery';

export interface PartnerStatus {
  isVerifiedPartner: boolean;
  partnerType: PartnerType | null;
}

/** Whether a profile belongs to a verified partner (and its type). */
export function usePartnerStatus(profileId: string | null | undefined) {
  return useQuery<PartnerStatus>({
    queryKey: ['partner-status', profileId],
    queryFn: async () => {
      const { data } = await supabase
        .from('gallery_profiles')
        .select('is_verified, partner_type')
        .eq('profile_id', profileId!)
        .maybeSingle();
      return {
        isVerifiedPartner: !!data?.is_verified,
        partnerType: (data?.partner_type as PartnerType) ?? null,
      };
    },
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });
}
