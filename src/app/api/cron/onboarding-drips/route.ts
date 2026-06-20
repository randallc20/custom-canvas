import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendArtistDripEmail, sendBuyerDripEmail } from '@/services/email';

const DAY = 24 * 60 * 60 * 1000;

// Daily onboarding drips. Artist drip stops once the profile goes live; buyer
// drip fires once if they haven't engaged. Idempotent via drip_emails_sent.
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminSupabaseClient();
  const now = Date.now();
  let sent = 0;

  const alreadySent = async (profileId: string, stage: string) => {
    const { data } = await admin.from('drip_emails_sent').select('stage').eq('profile_id', profileId).eq('stage', stage).maybeSingle();
    return !!data;
  };
  const markSent = (profileId: string, stage: string) => admin.from('drip_emails_sent').insert({ profile_id: profileId, stage });

  // --- Artist drip (stops when profile is live) ---
  const { data: artists } = await admin
    .from('artist_profiles')
    .select('id, is_live, created_at, profile:profiles(id, email, full_name)')
    .eq('is_live', false);

  for (const a of artists ?? []) {
    const profile = a.profile as unknown as { id: string; email: string | null; full_name: string | null } | null;
    if (!profile?.email) continue;
    const ageDays = (now - new Date(a.created_at).getTime()) / DAY;
    const stage = ageDays >= 7 ? 'artist_day7' : ageDays >= 3 ? 'artist_day3' : ageDays >= 1 ? 'artist_day1' : null;
    if (!stage) continue;
    if (await alreadySent(profile.id, stage)) continue;
    await sendArtistDripEmail(profile.email, profile.full_name ?? 'there', stage).catch(() => {});
    await markSent(profile.id, stage);
    sent++;
  }

  // --- Buyer drip (day 1, only if no engagement) ---
  const dayAgo = new Date(now - DAY).toISOString();
  const twoDaysAgo = new Date(now - 2 * DAY).toISOString();
  const { data: buyers } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'user')
    .lt('created_at', dayAgo)
    .gt('created_at', twoDaysAgo);

  for (const b of buyers ?? []) {
    if (!b.email) continue;
    if (await alreadySent(b.id, 'buyer_day1')) continue;
    const [{ count: saves }, { count: follows }, { count: orders }] = await Promise.all([
      admin.from('saved_listings').select('listing_id', { count: 'exact', head: true }).eq('profile_id', b.id),
      admin.from('follows').select('artist_id', { count: 'exact', head: true }).eq('follower_id', b.id),
      admin.from('orders').select('id', { count: 'exact', head: true }).eq('buyer_id', b.id),
    ]);
    if ((saves ?? 0) + (follows ?? 0) + (orders ?? 0) > 0) continue;
    await sendBuyerDripEmail(b.email, b.full_name ?? 'there').catch(() => {});
    await markSent(b.id, 'buyer_day1');
    sent++;
  }

  return NextResponse.json({ sent });
}
