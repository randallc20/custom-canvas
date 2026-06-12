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
