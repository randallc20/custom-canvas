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
 * KNOWN DIVERGENCE, recorded rather than fixed (R11 is tests only; the
 * weights live in app code and a migration).
 *
 * The SQL checks `v_avatar IS NOT NULL` and `a.banner_image_url IS NOT NULL`;
 * the TS checks truthiness. An EMPTY STRING therefore scores 15 points in the
 * database and 0 in the editor's bar — the artist sees a bar that disagrees
 * with the number Studio shows, and a profile can cross a completeness
 * threshold on two blank columns. Everything else (display_name, story,
 * primary_mediums, neighborhood) is length/trim-checked on both sides and
 * agrees. Fix direction when someone takes it: make the SQL test
 * `length(trim(coalesce(...,''))) > 0` for both URL columns, like the others.
 *
 * Observed on DEV 2026-09-02 by the same rolled-back transaction: 15.
 */
describe('completeness score — TS/SQL divergence on empty-string URLs', () => {
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

  it('SQL scored the same row 15 — avatar (10) + banner (5) on empty strings', () => {
    const SQL_OBSERVED = 15;
    expect(SQL_OBSERVED - calculateCompletenessScore(blank)).toBe(15);
  });
});
