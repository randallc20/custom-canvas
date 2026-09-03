import { z } from 'zod';

export const artistProfileSchema = z.object({
  display_name: z.string().min(2).max(100),
  bio: z.string().max(2000).optional().or(z.literal('')),
  artist_statement: z.string().max(5000).optional().or(z.literal('')),
  story: z.string().optional().or(z.literal('')),
  primary_mediums: z.array(z.string()).max(10).optional(),
  influences: z.string().max(1000).optional().or(z.literal('')),
  school: z.string().max(200).optional().or(z.literal('')),
  // Evaluated per validation, not at module load, and generous enough for a
  // first-year on a long programme: a literal 2030 would start rejecting real
  // graduation years, and the form's error toast only names the field.
  graduation_year: z.number().int().min(1900)
    .refine((y) => y <= new Date().getFullYear() + 6, 'That graduation year looks too far out')
    .optional().nullable(),
  status: z.enum(['student', 'recent_grad', 'working_artist']).optional().nullable(),
  neighborhood: z.string().max(100).optional().or(z.literal('')),
  city: z.string().min(2, 'Your city helps local buyers find you').max(100),
  // The scheme rule mirrors the DB CHECK (00052) so the user sees this
  // message instead of a constraint error. Empty is "no website" (saved as NULL).
  website_url: z.string().url().regex(/^https?:\/\//i, 'Website must start with http:// or https://')
    .optional().or(z.literal('')),
  fulfillment_pref: z.enum(['ships_national', 'ships_local', 'pickup_only', 'artist_delivered']).optional().nullable(),
  commissions_open: z.boolean(),
  commission_desc: z.string().max(2000).optional().or(z.literal('')),
  commission_min_dollars: z.number().min(0).optional().nullable(),
  commission_turnaround: z.string().max(100).optional().or(z.literal('')),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  bio_layout: z.enum(['left', 'center', 'minimal']),
});

export type ArtistProfileFormData = z.infer<typeof artistProfileSchema>;
