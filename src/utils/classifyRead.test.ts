import { describe, it, expect } from 'vitest';
import { classifyRead, NO_ROWS_CODE } from './classifyRead';

describe('classifyRead', () => {
  it('reports a row when data is present and there is no error', () => {
    expect(classifyRead({ data: { id: 'o1' }, error: null })).toBe('row');
  });

  it('reports absent for maybeSingle with no row and no error', () => {
    expect(classifyRead({ data: null, error: null })).toBe('absent');
  });

  it('reports absent for single() with PGRST116 (zero rows)', () => {
    expect(
      classifyRead({ data: null, error: { code: NO_ROWS_CODE, message: 'JSON object requested, multiple (or no) rows returned' } })
    ).toBe('absent');
  });

  it('reports failed for a fetch rejection (postgrest-js: data null, code empty)', () => {
    expect(classifyRead({ data: null, error: { code: '', message: 'TypeError: fetch failed' } })).toBe('failed');
  });

  it('reports failed for any other PostgREST error, never absent', () => {
    expect(classifyRead({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })).toBe('failed');
    expect(classifyRead({ data: null, error: { message: 'no code at all' } })).toBe('failed');
  });

  it('treats an error as failed even if data somehow came back', () => {
    expect(classifyRead({ data: { id: 'o1' }, error: { code: '', message: 'partial' } })).toBe('failed');
  });
});
