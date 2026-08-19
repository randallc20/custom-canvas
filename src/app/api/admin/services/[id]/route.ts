import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.enum(['photographer', 'framing', 'printing', 'other']).optional(),
  blurb: z.string().trim().max(500).nullish(),
  city: z.string().trim().min(1).max(80).optional(),
  contact_email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  contact_phone: z.string().trim().max(30).nullish().or(z.literal('').transform(() => null)),
  website_url: z.string().trim().url().nullish().or(z.literal('').transform(() => null)),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
});

async function requireAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return me?.role === 'admin' ? user : null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient()
    .from('artist_services')
    .update(parsed.data)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { error } = await createAdminSupabaseClient()
    .from('artist_services')
    .delete()
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
