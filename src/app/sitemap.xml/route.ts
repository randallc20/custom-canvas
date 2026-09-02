import { listingSitemapPageCount } from '@/lib/sitemapPages';

// Sitemap INDEX at the URL search engines (and any existing Search Console
// registration) already know. Next 14's `generateSitemaps` serves only the
// paged files (/sitemap/0.xml, /sitemap/1.xml, ...), so /sitemap.xml would
// otherwise 404 after R7 moved the sitemap to pages. This lists every page.
export const revalidate = 3600;

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://customcanvas.shop';
  const pages = await listingSitemapPageCount();
  const entries = Array.from(
    { length: pages },
    (_, id) => `  <sitemap><loc>${baseUrl}/sitemap/${id}.xml</loc></sitemap>`
  ).join('\n');
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
