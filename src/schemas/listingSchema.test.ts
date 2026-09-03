import { describe, it, expect } from 'vitest';
import { listingSchema, listingWritePatchSchema, listingWriteSchema } from './listingSchema';

// L4 added two required fields (Listing Standards Part one): what the piece
// IS, and its condition. Both fixtures carry them so these AI-rule cases keep
// testing the AI rule rather than the new ones.
const base = {
  title: 'Test Piece', medium: 'Oil', price_dollars: 100,
  price_visible: true, status: 'available' as const, tags: [],
  edition_type: 'original' as const, condition_notes: 'New, no damage.',
};
const writeBase = {
  title: 'Test Piece', medium: 'Oil', price_cents: 10000,
  price_visible: true, status: 'available' as const,
  edition_type: 'original' as const, condition_notes: 'New, no damage.',
};

describe('AI disclosure rule (mirrors DB CHECK listings_ai_disclosure_required)', () => {
  it('assisted with a short disclosure fails on the field, both schemas', () => {
    for (const [schema, data] of [[listingSchema, base], [listingWriteSchema, writeBase]] as const) {
      const r = schema.safeParse({ ...data, ai_involvement: 'assisted', ai_disclosure: 'AI helped' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(['ai_disclosure']);
    }
  });
  it('assisted with an empty/whitespace disclosure fails', () => {
    const r = listingSchema.safeParse({ ...base, ai_involvement: 'assisted', ai_disclosure: '                         ' });
    expect(r.success).toBe(false);
  });
  it('assisted with a real disclosure passes', () => {
    const r = listingSchema.safeParse({
      ...base, ai_involvement: 'assisted',
      ai_disclosure: 'Generated a colour study, then painted the final work in oil.',
    });
    expect(r.success).toBe(true);
  });
  it('none with no disclosure passes', () => {
    expect(listingSchema.safeParse({ ...base, ai_involvement: 'none' }).success).toBe(true);
    expect(listingWriteSchema.safeParse({ ...writeBase, ai_involvement: 'none', ai_disclosure: null }).success).toBe(true);
  });
});

describe('PATCH schema (zod 4 partial regression)', () => {
  it('listingWritePatchSchema exists and parses a partial without throwing', async () => {
    const { listingWritePatchSchema, AI_DISCLOSURE_MIN } = await import('./listingSchema');
    expect(AI_DISCLOSURE_MIN).toBe(20); // pinned: the DB CHECK in 00042 mirrors this
    const r = listingWritePatchSchema.safeParse({ price_cents: 12345 });
    expect(r.success).toBe(true);
  });
  it('patch declaring assisted without a real disclosure fails on the field', async () => {
    const { listingWritePatchSchema } = await import('./listingSchema');
    const r = listingWritePatchSchema.safeParse({ ai_involvement: 'assisted', ai_disclosure: 'short' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['ai_disclosure']);
  });
});

/**
 * L4 — Listing Standards Part one, as validation.
 *
 * "Open edition, print, or reproduction ... The title or first displayed line
 * must clearly identify it as a print or reproduction. It may not be described
 * or presented as a unique original." And: "Describing a reproduction as an
 * original is grounds for immediate removal and account closure." A rule with
 * that consequence attached should not depend on an artist remembering it.
 */
describe('Listing Standards (L4)', () => {
  const base = {
    title: 'Bayou Morning',
    medium: 'Oil on canvas',
    price_dollars: 400,
    price_visible: true,
    status: 'available' as const,
    tags: [],
    ai_involvement: 'none' as const,
    edition_type: 'original' as const,
    condition_notes: 'New, no damage.',
  };

  it('accepts an original with condition notes', () => {
    expect(listingSchema.safeParse(base).success).toBe(true);
  });

  it('requires condition notes, and says a short answer is fine', () => {
    const r = listingSchema.safeParse({ ...base, condition_notes: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'condition_notes');
      expect(issue?.message).toMatch(/New, no damage/);
    }
  });

  it('refuses a reproduction whose title does not say so, quoting the standard', () => {
    const r = listingSchema.safeParse({ ...base, edition_type: 'reproduction' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'title');
      expect(issue?.message).toMatch(/title or first displayed line must clearly identify it/);
    }
  });

  it.each(['open_edition', 'reproduction'] as const)('%s accepts a title that says print', (edition_type) => {
    expect(listingSchema.safeParse({ ...base, edition_type, title: 'Bayou Morning (giclée print)' }).success).toBe(true);
    expect(listingSchema.safeParse({ ...base, edition_type, title: 'Bayou Morning — Reproduction' }).success).toBe(true);
  });

  it('does not demand the word print of an original or a limited edition', () => {
    expect(listingSchema.safeParse(base).success).toBe(true);
    expect(
      listingSchema.safeParse({ ...base, edition_type: 'limited_edition', edition_size: 50, edition_number: 12 }).success
    ).toBe(true);
  });

  it('requires a limited edition to state its size and this piece number', () => {
    const r = listingSchema.safeParse({ ...base, edition_type: 'limited_edition' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path[0])).toEqual(
        expect.arrayContaining(['edition_size', 'edition_number'])
      );
    }
  });

  it('refuses number 60 of an edition of 50', () => {
    const r = listingSchema.safeParse({
      ...base,
      edition_type: 'limited_edition',
      edition_size: 50,
      edition_number: 60,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.find((i) => i.path[0] === 'edition_number')?.message).toMatch(/cannot be number 60 of 50/);
    }
  });

  it('applies the same rules to the server write schema', () => {
    const write = {
      title: 'Bayou Morning',
      medium: 'Oil on canvas',
      price_cents: 40_000,
      price_visible: true,
      status: 'available' as const,
      edition_type: 'reproduction' as const,
      condition_notes: 'New, no damage.',
    };
    expect(listingWriteSchema.safeParse(write).success).toBe(false);
    expect(listingWriteSchema.safeParse({ ...write, title: 'Bayou Morning print' }).success).toBe(true);
  });

  it('applies the reproduction rule to a PATCH that only changes the edition type', () => {
    // The easy hole: edit an original into a reproduction without touching
    // the title. The patch carries both fields from the form, so the rule
    // still sees them.
    expect(
      listingWritePatchSchema.safeParse({ edition_type: 'reproduction', title: 'Bayou Morning' }).success
    ).toBe(false);
  });
});
