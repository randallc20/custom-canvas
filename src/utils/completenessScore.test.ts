import { describe, it, expect } from 'vitest';
import { calculateCompletenessScore, type CompletenessInput } from './completenessScore';

/**
 * The same eleven weights are implemented twice: here in TS (the editor's
 * live bar) and in plpgsql as `refresh_completeness_score()` (migration
 * 00009, the value stored on `artist_profiles.completeness_score` and shown
 * in Studio). Nothing checked that they agree — 05-P3 "tests", item 6, filed
 * alongside a P3 showing them already drifting in practice.
 *
 * HOW THE SQL COLUMN BELOW WAS PRODUCED (2026-09-02, R11):
 * `scripts/completeness-parity.sql` created these eight artists on DEV inside
 * ONE transaction, called `refresh_completeness_score(id)` on each, printed
 * the results and ROLLED BACK. The numbers are hard-coded here on purpose —
 * a test must not need a database. To regenerate after a weights change:
 *
 *   PGPASSWORD=... psql -h <pooler host> -U <db user> -d postgres \
 *     -f scripts/completeness-parity.sql
 *
 * (fulfillment_pref must be one of ships_national | ships_local |
 * pickup_only | artist_delivered — the CHECK constraint rejects anything
 * else, which is why the fixtures use those.)
 */

type Fixture = {
  name: string;
  input: CompletenessInput;
  /** What refresh_completeness_score() returned on DEV for the same state. */
  sql: number;
};

const FIXTURES: Fixture[] = [
  {
    name: 'empty — a row that exists and nothing else',
    input: {},
    sql: 0,
  },
  {
    name: 'name only',
    input: { display_name: 'Ada Rivers' },
    sql: 10,
  },
  {
    name: 'story too short to count (19 chars)',
    input: { display_name: 'Ada Rivers', story: 'Too short to count.' },
    sql: 10,
  },
  {
    name: 'story exactly at the 100-char threshold',
    input: { display_name: 'Ada Rivers', story: 'a'.repeat(100) },
    sql: 25,
  },
  {
    name: 'story 99 chars padded to 103 — both sides trim first',
    input: { display_name: 'Ada Rivers', story: `  ${'b'.repeat(99)}  ` },
    sql: 10,
  },
  {
    name: 'mid profile — name, story, mediums, neighborhood, fulfillment, avatar, one listing',
    input: {
      display_name: 'Ada Rivers',
      story: 'c'.repeat(140),
      primary_mediums: ['oil', 'gouache'],
      neighborhood: 'Montrose',
      fulfillment_pref: 'ships_national',
      avatar_url: 'https://cdn/avatar.png',
      has_listings: true,
    },
    sql: 75,
  },
  {
    name: 'everything — all eleven weights',
    input: {
      display_name: 'Ada Rivers',
      story: 'd'.repeat(140),
      primary_mediums: ['oil'],
      neighborhood: 'Montrose',
      fulfillment_pref: 'pickup_only',
      avatar_url: 'https://cdn/avatar.png',
      banner_image_url: 'https://cdn/banner.png',
      has_listings: true,
      stripe_onboarded: true,
      has_education: true,
      has_personal_photo: true,
    },
    sql: 100,
  },
];

describe('calculateCompletenessScore agrees with the SQL refresh_completeness_score', () => {
  for (const f of FIXTURES) {
    it(`${f.name} → ${f.sql}`, () => {
      expect(calculateCompletenessScore(f.input)).toBe(f.sql);
    });
  }

  it('the weights still total 100', () => {
    const everything = FIXTURES.find((f) => f.name.startsWith('everything'))!;
    expect(calculateCompletenessScore(everything.input)).toBe(100);
  });
});

/**
 * Empty-string URLs. The SQL once checked `IS NOT NULL` on the two image
 * columns while the TS checked truthiness, so a cleared avatar scored 15 in
 * the database and 0 on screen. Migration 00054 made the SQL length/trim
 * check both columns like the rest; observed on DEV 2026-09-02 after 00054
 * by a rolled-back transaction with blank display_name/story/neighborhood,
 * '' avatar_url and '' banner_image_url: 0.
 */
describe('completeness score — empty-string URLs score nothing on both sides', () => {
  const blank: CompletenessInput = {
    display_name: '   ',
    story: '   ',
    primary_mediums: [],
    neighborhood: '   ',
    avatar_url: '',
    banner_image_url: '',
  };

  it('TS scores blank strings as 0', () => {
    expect(calculateCompletenessScore(blank)).toBe(0);
  });

  it('SQL (00054) scores the same row 0 — parity holds', () => {
    const SQL_OBSERVED = 0;
    expect(calculateCompletenessScore(blank)).toBe(SQL_OBSERVED);
  });
});
