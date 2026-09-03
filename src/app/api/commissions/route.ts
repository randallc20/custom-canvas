import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { acceptanceGateFor } from '@/lib/acceptance';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { commissionRequestSchema } from '@/schemas/commissionSchema';
import { sendCommissionRequestEmail } from '@/services/email';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = request.nextUrl.searchParams.get('artist_id');
  const requesterId = request.nextUrl.searchParams.get('requester_id');

  let query = supabase.from('commissions').select('*').order('created_at', { ascending: false });

  if (artistId) query = query.eq('artist_id', artistId);
  if (requesterId) query = query.eq('requester_id', requesterId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Ruling D11 (L2): a stale acceptance blocks the gated actions. The
  // interstitial is the visible half of this; a client that never renders it
  // still gets refused here.
  const gate = await acceptanceGateFor(user.id);
  if (gate) return NextResponse.json(gate.body, { status: gate.status });

  const body = await request.json();
  const parsed = commissionRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { artist_id, ...commissionData } = parsed.data;

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, profile_id, is_live')
    .eq('id', artist_id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  // Approval gate: non-live artists can't receive commission requests (their
  // page is unreachable anyway — this closes the direct-id path).
  if (!artist.is_live) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({
      participant_one: user.id,
      participant_two: artist.profile_id,
      context_type: 'commission',
    })
    .select()
    .single();
  // The conversation IS the commission's home now — a commission without one
  // would be unreachable in the UI, so fail the request instead.
  if (convError || !conversation) {
    return NextResponse.json({ error: 'Could not start the conversation. Please try again.' }, { status: 500 });
  }

  const { data: commission, error } = await supabase
    .from('commissions')
    .insert({
      ...commissionData,
      artist_id,
      requester_id: user.id,
      conversation_id: conversation.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('conversations').update({ context_id: commission.id }).eq('id', conversation.id);

  const admin = createAdminSupabaseClient();

  // email is service-role-only (00031 column privacy) — the user-context
  // client can no longer read it.
  const { data: artistProfile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', artist.profile_id)
    .single();

  if (artistProfile?.email) {
    sendCommissionRequestEmail(artistProfile.email, artistProfile.full_name ?? 'Artist', commission.title).catch((e) => Sentry.captureException(e));
  }

  // In-app notification for the artist (service role — notifications has no
  // client INSERT policy, and the row belongs to the artist, not the caller).
  // Best-effort: the request itself already succeeded.
  const { error: notifError } = await admin.from('notifications').insert({
    user_id: artist.profile_id,
    type: 'commission_request',
    title: 'New commission request',
    body: `"${commission.title}" — budget $${(commission.budget_min_cents / 100).toFixed(0)}–$${(commission.budget_max_cents / 100).toFixed(0)}.`,
    link: `/messages/${conversation.id}`,
  });
  if (notifError) console.error('commission_request notification failed:', notifError.message);

  return NextResponse.json(commission, { status: 201 });
}
