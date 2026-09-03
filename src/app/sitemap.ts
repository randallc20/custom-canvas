import type { MetadataRoute } from 'next';
import { createSitemapSupabaseClient, listingSitemapPageCount, SITEMAP_PAGE_SIZE } from '@/lib/sitemapPages';
import { LEGAL_DOCUMENTS } from '@/lib/legalDocuments';

/** Paged sitemaps (/sitemap/0.xml, /sitemap/1.xml, ...): page N carries
 *  listings N*1000..N*1000+999 in a stable created_at order; page 0 also
 *  carries the static, artist and partner pages. Before this, one unordered
 *  unbounded select capped at PostgREST's max_rows meant a catalog past
 *  1,000 listings offered search engines an arbitrary thousand (02-P2).
 *  robots.ts lists every page. */
export async function generateSitemaps() {
  const pages = await listingSitemapPageCount();
  return Array.from({ length: pages }, (_, id) => ({ id }));
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.shop';
  const supabase = createSitemapSupabaseClient();
  const from = id * SITEMAP_PAGE_SIZE;

  const { data: listings } = await supabase
    .from('listings')
    .select('id, updated_at')
    .eq('status', 'available')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + SITEMAP_PAGE_SIZE - 1);

  const listingPages: MetadataRoute.Sitemap = (listings ?? []).map((l) => ({
    url: `${baseUrl}/listing/${l.id}`,
    lastModified: new Date(l.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  if (id !== 0) return listingPages;

  const [{ data: artists }, { data: galleries }] = await Promise.all([
    supabase.from('artist_profiles').select('slug, updated_at').eq('is_live', true).order('created_at', { ascending: true }),
    supabase.from('gallery_profiles').select('slug, updated_at').eq('is_verified', true).order('created_at', { ascending: true }),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/partners`, changeFrequency: 'weekly', priority: 0.7 },
    // The counsel document set (L1). The Artist Agreement is public but
    // noindex, so it is deliberately absent.
    ...LEGAL_DOCUMENTS.filter((d) => !d.noindex).map((d) => ({
      url: `${baseUrl}/${d.slug}`,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  const artistPages: MetadataRoute.Sitemap = (artists ?? []).map((a) => ({
    url: `${baseUrl}/artist/${a.slug}`,
    lastModified: new Date(a.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const galleryPages: MetadataRoute.Sitemap = (galleries ?? []).map((g) => ({
    url: `${baseUrl}/gallery/${g.slug}`,
    lastModified: new Date(g.updated_at),
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...artistPages, ...galleryPages, ...listingPages];
}
