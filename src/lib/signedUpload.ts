import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const ALLOWED_BUCKETS = [
  'avatars',
  'banners',
  'artist-photos',
  'artist-videos',
  'chat-attachments',
  'listing-images',
] as const;

type Bucket = (typeof ALLOWED_BUCKETS)[number];

// One factory for every signed-upload endpoint so auth and policy changes
// apply to all buckets at once.
export function createSignedUploadHandler(bucket: Bucket) {
  if (!ALLOWED_BUCKETS.includes(bucket)) throw new Error(`Unknown bucket: ${bucket}`);

  return async function POST() {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      path,
    });
  };
}
