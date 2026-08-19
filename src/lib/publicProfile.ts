// The client-readable profiles columns (00031 column privacy). Use this in
// every user/anon-context embed instead of profiles(*) — email and
// unsubscribe_token are service-role only, and a `*` embed would error once
// the column grants are in place.
export const PUBLIC_PROFILE_COLS = 'id, full_name, avatar_url, role, created_at';

// Embeds FROM artist_profiles must name the FK: once 00030 adds
// reviewed_by → profiles, artist_profiles has TWO relationships to profiles
// and an unhinted profiles(...) embed fails with PGRST201 (ambiguous).
export const ARTIST_PROFILE_EMBED = `profile:profiles!artist_profiles_profile_id_fkey(${PUBLIC_PROFILE_COLS})`;
