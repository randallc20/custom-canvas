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
  city: string;
  website_url: string | null;
  fulfillment_pref: FulfillmentPref | null;
  commissions_open: boolean;
  commission_desc: string | null;
  commission_min_cents: number | null;
  commission_turnaround: string | null;
  accent_color: string;
  banner_image_url: string | null;
  bio_layout: BioLayout;
  is_houston_verified: boolean;
  is_featured: boolean;
  completeness_score: number;
  is_live: boolean;
  stripe_account_id: string | null;
  stripe_onboarded: boolean;
  search_vector: string | null;
  created_at: string;
  updated_at: string;
}

export type ArtistWithProfile = ArtistProfile & {
  profile: Profile;
};
