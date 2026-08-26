/**
 * Client-side mirror of the public-visibility rule the database enforces via
 * RLS (00033, amended 00036): a listing is publicly reachable iff its own
 * status isn't hidden/draft AND its artist is live (approved). If the SQL
 * policy changes, change this with it — admin surfaces use it to say whether
 * buyers can actually see a listing.
 */
export function isListingPubliclyVisible(
  status: string,
  artistIsLive: boolean | null | undefined
): boolean {
  return status !== 'hidden' && status !== 'draft' && !!artistIsLive;
}
