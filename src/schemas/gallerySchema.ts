import { z } from 'zod';

export const partnerTypeSchema = z.enum(['gallery', 'museum', 'school', 'business',
  'interior_design', 'artist_residency', 'corporate', 'community_org']);

export const galleryProfileSchema = z.object({
  gallery_name: z.string().min(2).max(200),
  partner_type: partnerTypeSchema,
  bio: z.string().max(2000).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  neighborhood: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100),
  website_url: z.string().url().optional().or(z.literal('')),
});

export type GalleryProfileFormData = z.infer<typeof galleryProfileSchema>;
