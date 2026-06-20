import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// One-click unsubscribe (CAN-SPAM): token identifies the profile, no session
// needed. Turns off all optional email categories.
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('unsubscribe_token', token)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });

  const { error } = await admin
    .from('profiles')
    .update({ email_preferences: { marketing: false, new_listing_alerts: false, message_notifications: false, price_drop_alerts: false } })
    .eq('id', profile.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
