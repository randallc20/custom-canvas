import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';
import { artistProfileSchema } from '@/schemas/artistSchema';

// The form's own schema, made partial for a PATCH, with the two columns the
// route accepts that the form expresses differently: the form works in
// dollars (commission_min_dollars) and never sends the banner URL. Values
// were unvalidated before — a negative minimum or a non-numeric year reached
// Postgres as a 500 (01-r2 appendix).
const artistPatchSchema = artistProfileSchema
  .partial()
  .omit({ commission_min_dollars: true })
  .extend({
    commission_min_cents: z.number().int().min(0).nullable().optional(),
    banner_image_url: z.string().url().max(2000).nullable().optional(),
  });

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('artist_profiles')
    .select(`${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED}`)
    .eq('slug', params.slug)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('profile_id')
    .eq('slug', params.slug)
    .single();

  if (!artist || artist.profile_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Allowlist editable columns — never trust the body to set trust/ranking
  // fields (is_houston_verified, is_featured, completeness_score, stripe_*).
  const EDITABLE = [
    'display_name', 'bio', 'artist_statement', 'story', 'primary_mediums',
    'influences', 'school', 'graduation_year', 'status', 'neighborhood', 'city',
    'website_url', 'fulfillment_pref', 'commissions_open', 'commission_desc',
    'commission_min_cents', 'commission_turnaround', 'accent_color', 'bio_layout',
    'banner_image_url',
  ] as const;
  const picked: Record<string, unknown> = {};
  for (const key of EDITABLE) if (key in body) picked[key] = body[key];

  const parsed = artistPatchSchema.safeParse(picked);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updates: Record<string, unknown> = { ...parsed.data };
  // "No website" is NULL on the row: the 00052 scheme CHECK rejects ''.
  if (updates.website_url === '') updates.website_url = null;

  const { data, error } = await supabase
    .from('artist_profiles')
    .update(updates)
    .eq('slug', params.slug)
    .select(ARTIST_PUBLIC_COLS) // bare .select() would 42501 on revoked columns
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
