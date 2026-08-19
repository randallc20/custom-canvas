// The client-readable profiles columns (00031 column privacy). Use this in
// every user/anon-context embed instead of profiles(*) — email and
// unsubscribe_token are service-role only, and a `*` embed would error once
// the column grants are in place.
export const PUBLIC_PROFILE_COLS = 'id, full_name, avatar_url, role, created_at';

// Embeds FROM artist_profiles must name the FK: once 00030 adds
// reviewed_by → profiles, artist_profiles has TWO relationships to profiles
// and an unhinted profiles(...) embed fails with PGRST201 (ambiguous).
export const ARTIST_PROFILE_EMBED = `profile:profiles!artist_profiles_profile_id_fkey(${PUBLIC_PROFILE_COLS})`;

// artist_profiles is column-restricted too (00033): rejection_reason,
// reviewed_by/at and stripe_account_id are service-role-only, so client and
// user-context code cannot select('*') — use this list (everything public;
// search_vector omitted as useless payload). Adding a column to
// artist_profiles? Add it here AND grant it in a migration.
export const ARTIST_PUBLIC_COLS =
  'id, profile_id, slug, display_name, bio, artist_statement, influences, school, ' +
  'graduation_year, status, neighborhood, city, website_url, fulfillment_pref, ' +
  'commissions_open, commission_desc, commission_min_cents, commission_turnaround, ' +
  'accent_color, banner_image_url, bio_layout, is_houston_verified, is_featured, ' +
  'completeness_score, is_live, stripe_onboarded, created_at, updated_at, ' +
  'pinned_listing_ids, story, primary_mediums, away_mode, away_message, away_until, ' +
  'commissions_open_before_away, last_listing_alert_at, application_status';
