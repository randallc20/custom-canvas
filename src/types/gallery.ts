export interface GalleryProfile {
  id: string;
  profile_id: string;
  slug: string;
  gallery_name: string;
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
