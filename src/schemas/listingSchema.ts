import { z } from 'zod';

// Forms work in dollars; submit handlers convert to integer cents via
// Math.round before anything touches the database.
export const listingSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  medium: z.string().min(1).max(100),
  width_cm: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  depth_cm: z.number().positive().optional().nullable(),
  year_created: z.number().int().min(1000).max(new Date().getFullYear()).optional().nullable(),
  price_dollars: z.number().min(1, 'Price must be at least $1'),
  shipping_dollars: z.number().min(0).optional().nullable(),
  // Authenticity Policy: wholly AI-generated work is prohibited; AI-ASSISTED
  // work is allowed with disclosure. Asked at listing time rather than left for
  // the artist to remember to mention.
  ai_involvement: z.enum(['none', 'assisted']),
  ai_disclosure: z.string().trim().max(500).optional().nullable(),
  price_visible: z.boolean(),
  show_sold_price: z.boolean().optional(),
  sold_price_dollars: z.number().min(0).optional().nullable(),
  series_id: z.string().optional().or(z.literal('')),
  status: z.enum(['available', 'sold', 'commission_only', 'hidden', 'draft']),
  tags: z.array(z.string()).max(10),
});

export type ListingFormData = z.infer<typeof listingSchema>;

export function toCents(dollars: number | null | undefined): number {
  return Math.round((dollars ?? 0) * 100);
}

// Server-side shape for the listing write API: integer cents (forms convert
// at the edge), no artist_id (the route derives it from the session).
export const listingWriteSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).nullable().optional(),
  medium: z.string().min(1).max(100),
  width_cm: z.number().positive().nullable().optional(),
  height_cm: z.number().positive().nullable().optional(),
  depth_cm: z.number().positive().nullable().optional(),
  year_created: z.number().int().min(1000).max(new Date().getFullYear()).nullable().optional(),
  price_cents: z.number().int().min(100, 'Price must be at least $1'),
  shipping_rate_cents: z.number().int().min(0).nullable().optional(),
  ai_involvement: z.enum(['none', 'assisted']).optional(),
  ai_disclosure: z.string().trim().max(500).nullable().optional(),
  price_visible: z.boolean(),
  sold_price_cents: z.number().int().min(0).nullable().optional(),
  show_sold_price: z.boolean().optional(),
  series_id: z.string().uuid().nullable().optional(),
  status: z.enum(['available', 'sold', 'commission_only', 'hidden', 'draft']),
});

export type ListingWriteData = z.infer<typeof listingWriteSchema>;
