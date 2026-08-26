import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';

// listings has no admin UPDATE policy (only "Artists can update own
// listings"), so the old client-side hide from /admin/listings matched zero
// rows and silently never worked — the moderation decision goes through the
// service role after a role check, like galleries/applications.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action } = await request.json();
  if (action !== 'hide') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('listings')
    .update({ status: 'hidden' })
    .eq('id', params.id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
