import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';
export const alt = 'Custom Canvas artist';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  let name = 'Houston Artist';
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/artist_profiles?slug=eq.${params.slug}&select=display_name`;
    const res = await fetch(url, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
    });
    const rows = await res.json();
    if (rows?.[0]?.display_name) name = rows[0].display_name;
  } catch { /* fall back */ }

  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FAF6F0', padding: 80 }}>
        <div style={{ fontSize: 32, color: '#E8704A', fontWeight: 700 }}>Custom Canvas</div>
        <div style={{ fontSize: 72, color: '#2D2A26', fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
        <div style={{ fontSize: 38, color: '#6F6A63' }}>Houston Artist on Custom Canvas</div>
      </div>
    ),
    size
  );
}
