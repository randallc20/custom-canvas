import { z } from 'zod';

export const reviewSchema = z.object({
  order_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional().or(z.literal('')),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;
