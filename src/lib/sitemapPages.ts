import { createServerSupabaseClient } from '@/lib/supabase-server';

/** Listing URLs per sitemap file. Sitemaps allow 50,000; 1,000 keeps each
 *  file well under PostgREST's default max_rows so a page is never silently
 *  truncated (02-P2). */
export const SITEMAP_PAGE_SIZE = 1000;

/** How many listing sitemap pages exist right now (always at least one, so
 *  /sitemap/0.xml exists even before the first listing). */
export async function listingSitemapPageCount(): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'available');
  return Math.max(1, Math.ceil((count ?? 0) / SITEMAP_PAGE_SIZE));
}
