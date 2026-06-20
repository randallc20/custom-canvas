import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendCommissionNudgeEmail } from '@/services/email';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

// Daily: nudge artists whose in-progress commissions have gone 14+ days with
// no progress update (max one nudge per commission per 14 days).
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const cutoff = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();

  const { data: commissions } = await supabase
    .from('commissions')
    .select('id, title, created_at, last_nudge_at, requester_id, artist:artist_profiles!inner(display_name, profile:profiles(email, full_name, email_preferences))')
    .in('status', ['accepted', 'in_progress'])
    .or(`last_nudge_at.is.null,last_nudge_at.lt.${cutoff}`);

  let nudged = 0;
  for (const c of commissions ?? []) {
    // Most recent update for this commission.
    const { data: lastUpdate } = await supabase
      .from('commission_updates')
      .select('created_at')
      .eq('commission_id', c.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastActivity = lastUpdate?.created_at ?? c.created_at;
    if (new Date(lastActivity).getTime() > Date.now() - FOURTEEN_DAYS_MS) continue;

    const artist = c.artist as unknown as { display_name: string; profile: { email: string | null; full_name: string | null; email_preferences: { marketing?: boolean } | null } | null };
    const email = artist.profile?.email;
    if (email && artist.profile?.email_preferences?.marketing !== false) {
      const { data: buyer } = await supabase.from('profiles').select('full_name').eq('id', c.requester_id).single();
      sendCommissionNudgeEmail(email, artist.display_name, buyer?.full_name ?? 'your buyer', c.title, c.id).catch(() => {});
    }
    await supabase.from('commissions').update({ last_nudge_at: new Date().toISOString() }).eq('id', c.id);
    nudged++;
  }

  return NextResponse.json({ nudged });
}
