import { supabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/report';

export async function createReport(params: {
  reporterId: string;
  listingId: string;
  reason: ReportReason;
  description?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    listing_id: params.listingId,
    reason: params.reason,
    description: params.description ?? null,
    status: 'pending',
  });

  if (error) throw error;
}

export async function reportUser(params: {
  reporterId: string;
  profileId: string;
  conversationId?: string;
  reason: ReportReason;
  description?: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_profile_id: params.profileId,
    conversation_id: params.conversationId ?? null,
    reason: params.reason,
    description: params.description ?? null,
    status: 'pending',
  });
  if (error) throw error;
}
