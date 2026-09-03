import { Profile } from './user';

export type ArtistStatus = 'student' | 'recent_grad' | 'working_artist';
export type FulfillmentPref = 'ships_national' | 'ships_local' | 'pickup_only' | 'artist_delivered';
export type BioLayout = 'left' | 'center' | 'minimal';

export interface ArtistProfile {
  id: string;
  profile_id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  artist_statement: string | null;
  influences: string | null;
  school: string | null;
  graduation_year: number | null;
  status: ArtistStatus | null;
  neighborhood: string | null;
  // Nullable with a default in the DB (00001). Onboarding sets all four, so
  // no live row has a null today; the types said 'cannot be null', which is a
  // promise the schema does not make.
  city: string | null;
  website_url: string | null;
  fulfillment_pref: FulfillmentPref | null;
  commissions_open: boolean | null;
  commission_desc: string | null;
  commission_min_cents: number | null;
  commission_turnaround: string | null;
  accent_color: string | null;
  banner_image_url: string | null;
  bio_layout: BioLayout | null;
  is_houston_verified: boolean;
  is_featured: boolean;
  completeness_score: number;
  is_live: boolean;
  /** Service-role only (00033 column privacy) — absent from client reads. */
  stripe_account_id?: string | null;
  stripe_onboarded: boolean;
  /** Omitted from ARTIST_PUBLIC_COLS (useless payload) — absent from client reads. */
  search_vector?: string | null;
  story: string | null;
  primary_mediums: string[] | null;
  pinned_listing_ids: string[] | null;
  away_mode: boolean;
  away_message: string | null;
  away_until: string | null;
  created_at: string;
  updated_at: string;
}

export type ArtistWithProfile = ArtistProfile & {
  profile: Profile;
};

export interface ArtistEducation {
  id: string;
  artist_id: string;
  partner_id: string | null;
  institution: string;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  is_current: boolean;
  display_order: number;
  created_at: string;
}

export interface ArtistPersonalPhoto {
  id: string;
  artist_id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
  created_at: string;
}

export interface ArtistVideo {
  id: string;
  artist_id: string;
  video_url: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  display_order: number;
  created_at: string;
}

export interface ListingSeries {
  id: string;
  artist_id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}
