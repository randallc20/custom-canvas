export type PartnerType =
  | 'gallery'
  | 'museum'
  | 'school'
  | 'business'
  | 'interior_design'
  | 'artist_residency'
  | 'corporate'
  | 'community_org';

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  gallery: 'Gallery',
  museum: 'Museum',
  school: 'School',
  business: 'Business',
  interior_design: 'Design Firm',
  artist_residency: 'Residency',
  corporate: 'Corporate',
  community_org: 'Organization',
};

export interface GalleryProfile {
  id: string;
  profile_id: string;
  slug: string;
  gallery_name: string;
  partner_type: PartnerType;
  bio: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
  website_url: string | null;
  banner_image_url: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

// "Partner" is the product-facing term; the table keeps its original name.
export type PartnerProfile = GalleryProfile;
