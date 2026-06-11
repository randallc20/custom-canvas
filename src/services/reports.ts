import { supabase } from '@/lib/supabase';
import type { Report, ReportReason } from '@/types/report';

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

export async function getReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateReportStatus(
  reportId: string,
  status: Report['status'],
  adminNotes?: string,
  resolvedBy?: string
): Promise<void> {
  const { error } = await supabase
    .from('reports')
    .update({
      status,
      admin_notes: adminNotes ?? null,
      resolved_by: resolvedBy ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (error) throw error;
}
