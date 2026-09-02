import type { MetadataRoute } from 'next';
import { listingSitemapPageCount } from '@/lib/sitemapPages';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.shop';
  // sitemap.ts is paged (generateSitemaps), so there is no single
  // /sitemap.xml any more — list every page.
  const pages = await listingSitemapPageCount();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/checkout/', '/commission-request'],
      },
    ],
    sitemap: Array.from({ length: pages }, (_, id) => `${baseUrl}/sitemap/${id}.xml`),
  };
}
