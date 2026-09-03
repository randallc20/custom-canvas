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

// Listing Standards Part one, encoded where validation lives.
export const CONDITION_NOTES_MIN = 10;

export const EDITION_TYPES = ['original', 'limited_edition', 'open_edition', 'reproduction'] as const;
export type EditionType = (typeof EDITION_TYPES)[number];

export const EDITION_TYPE_LABELS: Record<EditionType, string> = {
  original: 'Original — a unique work',
  limited_edition: 'Limited edition — a numbered, permanently limited run',
  open_edition: 'Open edition print — not limited to a fixed number',
  reproduction: 'Reproduction — a copy of another work',
};

/** Listing Standards Part one: "The title or first displayed line must clearly
 *  identify it as a print or reproduction." Enforced on the title, because the
 *  "first displayed line" in this product IS the About-this-piece block, which
 *  the listing page renders from edition_type automatically — the title is the
 *  part an artist controls and the part that travels into search results,
 *  shelves and share cards. */
function reproductionTitleRule(
  data: { title?: string; edition_type?: EditionType },
  ctx: z.RefinementCtx
) {
  if (data.edition_type !== 'open_edition' && data.edition_type !== 'reproduction') return;
  if (data.title == null) return;
  if (/\b(print|prints|reproduction|reproductions|giclee|gicl\u00e9e)\b/i.test(data.title)) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['title'],
    message:
      'The Listing Standards require that "the title or first displayed line must clearly identify it as a print or reproduction" — include the word "print" or "reproduction" in the title.',
  });
}

/** Edition details, "where applicable": a limited edition must state its size
 *  and this piece's number, or the buyer cannot tell what they are buying. */
function editionDetailsRule(
  data: { edition_type?: EditionType; edition_size?: number | null; edition_number?: number | null },
  ctx: z.RefinementCtx
) {
  if (data.edition_type !== 'limited_edition') return;
  if (data.edition_size == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edition_size'], message: 'A limited edition must state its total size.' });
  }
  if (data.edition_number == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['edition_number'], message: "State this piece's number in the edition." });
  }
  if (data.edition_size != null && data.edition_number != null && data.edition_number > data.edition_size) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['edition_number'],
      message: `This piece cannot be number ${data.edition_number} of ${data.edition_size}.`,
    });
  }
}

const standardsRules = (
  data: {
    title?: string;
    edition_type?: EditionType;
    edition_size?: number | null;
    edition_number?: number | null;
  },
  ctx: z.RefinementCtx
) => {
  reproductionTitleRule(data, ctx);
  editionDetailsRule(data, ctx);
};

const editionFields = {
  edition_type: z.enum(EDITION_TYPES),
  edition_size: z.number().int().positive().optional().nullable(),
  edition_number: z.number().int().positive().optional().nullable(),
  is_signed: z.boolean().optional(),
  handling_notes: z.string().trim().max(2000).optional().nullable(),
  is_mature: z.boolean().optional(),
};

const FUTURE_YEAR_MSG = 'Year created cannot be in the future';
const notInTheFuture = (y: number) => y <= new Date().getFullYear();

// Forms work in dollars; submit handlers convert to integer cents via
// Math.round before anything touches the database.
const listingObject = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  medium: z.string().min(1).max(100),
  width_cm: z.number().positive().optional().nullable(),
  height_cm: z.number().positive().optional().nullable(),
  depth_cm: z.number().positive().optional().nullable(),
  // .refine, not .max(new Date().getFullYear()): a max is evaluated once at
  // module load, so a bundle built in December (or a server warm across new
  // year) rejects the new year until the next deploy.
  year_created: z.number().int().min(1000).refine(notInTheFuture, FUTURE_YEAR_MSG).optional().nullable(),
  // Both listing forms clear an empty price to null via numberOrNull, so the
  // type failure IS the empty field — say that, not "expected number".
  price_dollars: z.number({ error: 'Enter a price of at least $1' }).min(1, 'Price must be at least $1'),
  shipping_dollars: z.number().min(0).optional().nullable(),
  // Authenticity Policy: wholly AI-generated work is prohibited; AI-ASSISTED
  // work is allowed with disclosure. Asked at listing time rather than left for
  // the artist to remember to mention.
  ai_involvement: z.enum(['none', 'assisted']),
  ai_disclosure: z.string().trim().max(500).optional().nullable(),
  ...editionFields,
  // Required on new listings. "New, no damage" is a complete answer — the
  // point is that the buyer is told, not that there is something to confess.
  condition_notes: z
    .string()
    .trim()
    .min(CONDITION_NOTES_MIN, `Describe the condition in at least ${CONDITION_NOTES_MIN} characters — "New, no damage" is fine.`)
    .max(2000),
  price_visible: z.boolean(),
  show_sold_price: z.boolean().optional(),
  sold_price_dollars: z.number().min(0).optional().nullable(),
  series_id: z.string().optional().or(z.literal('')),
  status: z.enum(['available', 'sold', 'commission_only', 'hidden', 'draft']),
  tags: z.array(z.string()).max(10),
});
export const listingSchema = listingObject.superRefine(aiDisclosureRule).superRefine(standardsRules);

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
  year_created: z.number().int().min(1000).refine(notInTheFuture, FUTURE_YEAR_MSG).nullable().optional(),
  price_cents: z.number().int().min(100, 'Price must be at least $1'),
  shipping_rate_cents: z.number().int().min(0).nullable().optional(),
  ai_involvement: z.enum(['none', 'assisted']).optional(),
  ai_disclosure: z.string().trim().max(500).nullable().optional(),
  ...editionFields,
  condition_notes: z.string().trim().min(CONDITION_NOTES_MIN).max(2000),
  price_visible: z.boolean(),
  sold_price_cents: z.number().int().min(0).nullable().optional(),
  show_sold_price: z.boolean().optional(),
  series_id: z.string().uuid().nullable().optional(),
  status: z.enum(['available', 'sold', 'commission_only', 'hidden', 'draft']),
});
export const listingWriteSchema = listingWriteObject.superRefine(aiDisclosureRule).superRefine(standardsRules);

// PATCH shape. zod 4 refuses .partial() on a refined schema (it throws at
// RUNTIME, invisible to tsc — this took down every listing edit once), so the
// partial derives from the unrefined object and re-applies the rule. On a
// partial the rule fires only when the patch itself declares 'assisted';
// clearing or omitting fields still ends at the DB CHECK.
export const listingWritePatchSchema = listingWriteObject
  .partial()
  .superRefine(aiDisclosureRule)
  .superRefine(standardsRules);

export type ListingWriteData = z.infer<typeof listingWriteSchema>;
