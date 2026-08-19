import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminSupabaseClient } from '@/lib/supabase-admin';
import { z } from 'zod';

// Admin management of the Artist Services directory. Reads include inactive
// entries (the RLS SELECT policy only exposes active ones to signed-in
// users), and all writes are service-role — there are no user write policies.

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(['photographer', 'framing', 'printing', 'other']),
  blurb: z.string().trim().max(500).nullish(),
  city: z.string().trim().min(1).max(80).default('Houston'),
  contact_email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  contact_phone: z.string().trim().max(30).nullish().or(z.literal('').transform(() => null)),
  website_url: z.string().trim().url().nullish().or(z.literal('').transform(() => null)),
  is_active: z.boolean().default(true),
  display_order: z.number().int().min(0).default(0),
});

async function requireAdmin() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return me?.role === 'admin' ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { data, error } = await createAdminSupabaseClient()
    .from('artist_services')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = serviceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await createAdminSupabaseClient()
    .from('artist_services')
    .insert(parsed.data)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
