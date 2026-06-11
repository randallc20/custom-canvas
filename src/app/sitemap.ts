import type { MetadataRoute } from 'next';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.art';
  const supabase = createServerSupabaseClient();

  const [{ data: artists }, { data: listings }, { data: galleries }] = await Promise.all([
    supabase.from('artist_profiles').select('slug, updated_at').eq('is_live', true),
    supabase.from('listings').select('id, updated_at').eq('status', 'available'),
    supabase.from('gallery_profiles').select('slug, updated_at').eq('is_verified', true),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/galleries`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const artistPages: MetadataRoute.Sitemap = (artists ?? []).map((a) => ({
    url: `${baseUrl}/artist/${a.slug}`,
    lastModified: new Date(a.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const listingPages: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
    url: `${baseUrl}/listing/${l.id}`,
    lastModified: new Date(l.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const galleryPages: MetadataRoute.Sitemap = (galleries ?? []).map((g) => ({
    url: `${baseUrl}/gallery/${g.slug}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...artistPages, ...listingPages, ...galleryPages];
}
