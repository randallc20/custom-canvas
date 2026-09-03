import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TERMS_VERSION } from './agreement';

/**
 * The version the DATABASE stamps on a new account must equal the version the
 * app thinks it is.
 *
 * `handle_new_user` records the registration checkbox's acceptance in the same
 * statement that creates the profile (00063) — that is what removed the race
 * where the interstitial could ask someone to accept terms they had just
 * accepted. The version it writes comes from `current_terms_version()` in SQL,
 * which no TypeScript can see. So this reads the migration.
 *
 * If they ever disagree, every new account is stamped with a version the
 * product does not recognise, and every one of them is shown the
 * re-acceptance interstitial immediately. Fail here instead.
 */
describe('current_terms_version() tracks TERMS_VERSION', () => {
  it('the migration stamps the version the app records', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/00063_stamp_terms_at_signup.sql'),
      'utf8',
    );
    const match = /SELECT\s+'([\d.]+)'::text;/.exec(sql);
    expect(match, 'could not find the version literal in 00063').toBeTruthy();
    expect(match![1]).toBe(TERMS_VERSION);
  });

  it('handle_new_user stamps terms but NOT the terms of sale', () => {
    // Terms of Sale §1: "you accept them at checkout". Stamping them at
    // signup would record an acceptance nobody was shown.
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/00063_stamp_terms_at_signup.sql'),
      'utf8',
    );
    expect(sql).toContain('terms_version, terms_accepted_at');
    expect(sql).not.toContain('terms_of_sale_version');
  });
});
