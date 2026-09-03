export type ListingStatus = 'available' | 'sold' | 'commission_only' | 'hidden' | 'draft';
export type TagCategory = 'medium' | 'style' | 'subject' | 'mood';

export interface Listing {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  medium: string;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  year_created: number | null;
  price_cents: number;
  shipping_rate_cents: number | null;
  ai_involvement: 'none' | 'assisted';
  ai_disclosure: string | null;
  // Listing Standards Part one (00059 / L4).
  edition_type: import('@/schemas/listingSchema').EditionType;
  edition_size: number | null;
  edition_number: number | null;
  is_signed: boolean;
  condition_notes: string | null;
  handling_notes: string | null;
  /** Nudity or mature themes. Filtered out of browsing unless the viewer
   *  opts in (ruling D8). */
  is_mature: boolean;
  price_visible: boolean;
  sold_price_cents: number | null;
  show_sold_price: boolean;
  series_id: string | null;
  status: ListingStatus;
  is_featured: boolean;
  view_count: number;
  save_count: number;
  search_vector: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListingImage {
  id: string;
  listing_id: string;
  image_url: string;
  display_order: number;
  is_primary: boolean;
}

export interface Tag {
  id: string;
  name: string;
  category: TagCategory;
}

export type ListingWithImages = Listing & {
  images: ListingImage[];
  tags: Tag[];
  artist?: {
    slug: string;
    /** Seller of record — see PurchasePanel's artistName (L3). */
    display_name: string;
    fulfillment_pref: string | null;
  } | null;
};
