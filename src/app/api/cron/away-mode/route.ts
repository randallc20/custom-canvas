import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// Daily: auto-disable away mode once away_until has passed, restoring the
// artist's prior commission availability.
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: expired } = await admin
    .from('artist_profiles')
    .select('id, commissions_open_before_away')
    .eq('away_mode', true)
    .not('away_until', 'is', null)
    .lt('away_until', today);

  for (const a of expired ?? []) {
    await admin
      .from('artist_profiles')
      .update({
        away_mode: false,
        away_message: null,
        away_until: null,
        commissions_open: a.commissions_open_before_away ?? true,
        commissions_open_before_away: null,
      })
      .eq('id', a.id);
  }

  return NextResponse.json({ restored: expired?.length ?? 0 });
}
