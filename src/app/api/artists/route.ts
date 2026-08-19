import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ARTIST_PROFILE_EMBED, ARTIST_PUBLIC_COLS } from '@/lib/publicProfile';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search');
  const supabase = createServerSupabaseClient();

  let query = supabase
    .from('artist_profiles')
    .select(`${ARTIST_PUBLIC_COLS}, ${ARTIST_PROFILE_EMBED}`)
    .eq('is_live', true);

  if (search) query = query.textSearch('search_vector', search);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
