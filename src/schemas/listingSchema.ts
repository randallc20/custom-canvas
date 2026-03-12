import { z } from 'zod';

export const listingSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  medium: z.string().min(1).max(100),
  width_cm: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  depth_cm: z.number().positive().optional().nullable(),
  year_created: z.number().int().min(1000).max(new Date().getFullYear()).optional().nullable(),
  price_cents: z.number().int().min(100),
  status: z.enum(['available', 'sold', 'commission_only', 'hidden']).default('available'),
  tags: z.array(z.string()).max(10).default([]),
});

export type ListingFormData = z.infer<typeof listingSchema>;
