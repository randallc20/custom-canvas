import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { sendCommissionUpdateEmail } from '@/services/email';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { note, photoUrl, progressPercent } = await request.json();
  if (!note?.trim()) return NextResponse.json({ error: 'A note is required' }, { status: 400 });
  if (progressPercent != null && (progressPercent < 0 || progressPercent > 100)) {
    return NextResponse.json({ error: 'Progress must be 0–100' }, { status: 400 });
  }

  const { data: commission } = await supabase
    .from('commissions')
    .select('id, requester_id, artist_id, title, conversation_id, artist:artist_profiles!inner(profile_id, display_name)')
    .eq('id', params.id)
    .single();
  if (!commission) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const artist = commission.artist as unknown as { profile_id: string; display_name: string };
  if (artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminSupabaseClient();
  const { data: update, error } = await admin
    .from('commission_updates')
    .insert({
      commission_id: params.id,
      artist_id: commission.artist_id,
      note: note.trim(),
      photo_url: photoUrl ?? null,
      progress_percent: progressPercent ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The conversation is the commission's home — mirror the update there so
  // the thread reads as one story (commission_updates stays canonical).
  if (commission.conversation_id) {
    const progress = progressPercent != null ? ` (${progressPercent}% complete)` : '';
    const { error: msgError } = await admin.from('messages').insert({
      conversation_id: commission.conversation_id,
      sender_id: user.id,
      content: `Progress update${progress}: ${note.trim()}`,
      message_type: 'system',
    });
    if (!msgError) {
      await admin.from('conversations').update({
        last_message_text: 'Progress update',
        last_message_at: new Date().toISOString(),
      }).eq('id', commission.conversation_id);
    }
  }

  // Notify the buyer (in-app always; email best-effort).
  await admin.from('notifications').insert({
    user_id: commission.requester_id,
    type: 'commission_update',
    title: 'Commission update',
    body: `${artist.display_name} posted an update on "${commission.title}".`,
    link: commission.conversation_id ? `/messages/${commission.conversation_id}` : `/commissions/${params.id}`,
  });

  const { data: buyer } = await admin.from('profiles').select('email, full_name').eq('id', commission.requester_id).single();
  if (buyer?.email) {
    sendCommissionUpdateEmail(buyer.email, buyer.full_name ?? 'there', artist.display_name, note.trim(), params.id).catch(() => {});
  }

  return NextResponse.json(update);
}
