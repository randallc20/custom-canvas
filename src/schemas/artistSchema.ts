import { z } from 'zod';

export const artistProfileSchema = z.object({
  display_name: z.string().min(2).max(100),
  bio: z.string().max(2000).optional().or(z.literal('')),
  artist_statement: z.string().max(5000).optional().or(z.literal('')),
  influences: z.string().max(1000).optional().or(z.literal('')),
  school: z.string().max(200).optional().or(z.literal('')),
  graduation_year: z.number().int().min(1900).max(2030).optional().nullable(),
  status: z.enum(['student', 'recent_grad', 'working_artist']).optional().nullable(),
  neighborhood: z.string().max(100).optional().or(z.literal('')),
  city: z.string().max(100),
  website_url: z.string().url().optional().or(z.literal('')),
  fulfillment_pref: z.enum(['ships_national', 'ships_local', 'pickup_only', 'artist_delivered']).optional().nullable(),
  commissions_open: z.boolean(),
  commission_desc: z.string().max(2000).optional().or(z.literal('')),
  commission_min_cents: z.number().int().positive().optional().nullable(),
  commission_turnaround: z.string().max(100).optional().or(z.literal('')),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  bio_layout: z.enum(['left', 'center', 'minimal']),
});

export type ArtistProfileFormData = z.infer<typeof artistProfileSchema>;
