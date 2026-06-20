import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';
export const alt = 'Custom Canvas listing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { id: string } }) {
  let title = 'Original artwork';
  let price = '';
  let artist = '';
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/listings?id=eq.${params.id}&select=title,price_cents,price_visible,artist:artist_profiles(display_name)`;
    const res = await fetch(url, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}` },
    });
    const rows = await res.json();
    const l = rows?.[0];
    if (l) {
      title = l.title ?? title;
      artist = l.artist?.display_name ?? '';
      price = l.price_visible === false ? 'Contact for price' : `$${Math.floor((l.price_cents ?? 0) / 100).toLocaleString()}`;
    }
  } catch { /* fall back to defaults */ }

  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#FAF6F0', padding: 80 }}>
        <div style={{ fontSize: 32, color: '#E8704A', fontWeight: 700 }}>Custom Canvas</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 64, color: '#2D2A26', fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
          {artist && <div style={{ fontSize: 36, color: '#6F6A63', marginTop: 16 }}>by {artist}</div>}
        </div>
        <div style={{ fontSize: 44, color: '#C95A38', fontWeight: 700 }}>{price}</div>
      </div>
    ),
    size
  );
}
