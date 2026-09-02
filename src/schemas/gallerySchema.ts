import { z } from 'zod';

export const partnerTypeSchema = z.enum(['gallery', 'museum', 'school', 'business',
  'interior_design', 'artist_residency', 'corporate', 'community_org']);

export const galleryProfileSchema = z.object({
  gallery_name: z.string().min(2).max(200),
  partner_type: partnerTypeSchema,
  bio: z.string().max(2000).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  neighborhood: z.string().max(100).optional().or(z.literal('')),
  city: z.string().min(2, 'City is required').max(100),
  // The scheme rule mirrors the DB CHECK (00052) so the user sees this
  // message instead of a constraint error. Empty is "no website" (saved as NULL).
  website_url: z.string().url().regex(/^https?:\/\//i, 'Website must start with http:// or https://')
    .optional().or(z.literal('')),
});

export type GalleryProfileFormData = z.infer<typeof galleryProfileSchema>;
