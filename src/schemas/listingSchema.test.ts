import { describe, it, expect } from 'vitest';
import { listingSchema, listingWriteSchema } from './listingSchema';

const base = {
  title: 'Test Piece', medium: 'Oil', price_dollars: 100,
  price_visible: true, status: 'available' as const, tags: [],
};
const writeBase = {
  title: 'Test Piece', medium: 'Oil', price_cents: 10000,
  price_visible: true, status: 'available' as const,
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
