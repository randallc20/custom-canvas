import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { data, error } = await supabase.storage
    .from('banners')
    .createSignedUploadUrl(path);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: publicUrlData } = supabase.storage
    .from('banners')
    .getPublicUrl(path);

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    publicUrl: publicUrlData.publicUrl,
    path,
  });
}
