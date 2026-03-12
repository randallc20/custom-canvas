import { z } from 'zod';

export const galleryProfileSchema = z.object({
  gallery_name: z.string().min(2).max(200),
  bio: z.string().max(2000).optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  neighborhood: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100).default('Houston'),
  website_url: z.string().url().optional().or(z.literal('')),
});

export type GalleryProfileFormData = z.infer<typeof galleryProfileSchema>;
