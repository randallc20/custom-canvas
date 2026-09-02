import { z } from 'zod';

// Authenticity Policy, encoded where validation lives: declaring an
// AI-ASSISTED work requires a real disclosure. Mirrors the DB CHECK
// `listings_ai_disclosure_required` (00042) so the artist gets the inline
// field error instead of a raw constraint violation. Applied to BOTH the form
// schema and the server write schema via superRefine below.
export const AI_DISCLOSURE_MIN = 20;
function aiDisclosureRule(
  data: { ai_involvement?: 'none' | 'assisted'; ai_disclosure?: string | null },
  ctx: z.RefinementCtx
) {
  if (data.ai_involvement === 'assisted' && (data.ai_disclosure ?? '').trim().length < AI_DISCLOSURE_MIN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ai_disclosure'],
      message: `Please describe your contribution in at least ${AI_DISCLOSURE_MIN} characters.`,
    });
  }
}

// Forms work in dollars; submit handlers convert to integer cents via
// Math.round before anything touches the database.
const listingObject = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  medium: z.string().min(1).max(100),
  width_cm: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  depth_cm: z.number().positive().optional().nullable(),
  year_created: z.number().int().min(1000).max(new Date().getFullYear()).optional().nullable(),
  // Both listing forms clear an empty price to null via numberOrNull, so the
  // type failure IS the empty field — say that, not "expected number".
  price_dollars: z.number({ error: 'Enter a price of at least $1' }).min(1, 'Price must be at least $1'),
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
export const listingSchema = listingObject.superRefine(aiDisclosureRule);

export type ListingFormData = z.infer<typeof listingSchema>;

export function toCents(dollars: number | null | undefined): number {
  return Math.round((dollars ?? 0) * 100);
}

// Server-side shape for the listing write API: integer cents (forms convert
// at the edge), no artist_id (the route derives it from the session).
const listingWriteObject = z.object({
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
export const listingWriteSchema = listingWriteObject.superRefine(aiDisclosureRule);

// PATCH shape. zod 4 refuses .partial() on a refined schema (it throws at
// RUNTIME, invisible to tsc — this took down every listing edit once), so the
// partial derives from the unrefined object and re-applies the rule. On a
// partial the rule fires only when the patch itself declares 'assisted';
// clearing or omitting fields still ends at the DB CHECK.
export const listingWritePatchSchema = listingWriteObject.partial().superRefine(aiDisclosureRule);

export type ListingWriteData = z.infer<typeof listingWriteSchema>;
