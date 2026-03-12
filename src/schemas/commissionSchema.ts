import { z } from 'zod';

export const commissionRequestSchema = z
  .object({
    artist_id: z.string().uuid(),
    title: z.string().min(2).max(200),
    description: z.string().min(10).max(5000),
    budget_min_cents: z.number().int().min(100),
    budget_max_cents: z.number().int().min(100),
  })
  .refine((data) => data.budget_max_cents >= data.budget_min_cents, {
    message: 'Maximum budget must be greater than or equal to minimum budget',
    path: ['budget_max_cents'],
  });

export const commissionQuoteSchema = z.object({
  quoted_price_cents: z.number().int().min(100),
  estimated_completion: z.string().min(1),
  artist_notes: z.string().max(2000).optional().or(z.literal('')),
});

export type CommissionRequestFormData = z.infer<typeof commissionRequestSchema>;
export type CommissionQuoteFormData = z.infer<typeof commissionQuoteSchema>;
