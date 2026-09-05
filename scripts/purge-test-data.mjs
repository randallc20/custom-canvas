#!/usr/bin/env node
// Purge tester data from a Custom Canvas database, keeping the platform.
//
//   node scripts/purge-test-data.mjs --prod            # dry run: prints what WOULD go
//   node scripts/purge-test-data.mjs --prod --execute  # does it
//
// What goes:   every non-admin account and everything that hangs off it —
//              artist profiles, listings, images, conversations, messages,
//              commissions, notifications, follows, saves, analytics, drip
//              log — plus every file in the user-content storage buckets.
// What stays:  admin accounts (role = 'admin'), the `tags` reference list
//              (44 curated names, only ever SELECTed by the app), the schema,
//              Vercel crons, auth email templates.
//
// Order matters. `commissions.conversation_id` is NO ACTION, so deleting a
// user whose conversations carry a commission fails inside the auth cascade
// ("Database error deleting user" — the e2e seed hits this on every run).
// Commissions go first, explicitly; then the auth users, whose CASCADE takes
// profiles → artist_profiles → listings → images/tags, conversations →
// messages, and the rest; then the rows that only SET NULL on a user delete
// and would otherwise linger as orphans (analytics_events), and the admin's
// own notifications, which are about tester activity.
//
// Written for the pre-launch reset of 2026-09-05. The DEV database is the
// e2e target and is reset by scripts/seed-e2e.mjs; this is for prod, and it
// refuses to run against anything else unless told.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const EXECUTE = args.has('--execute');
const target = args.has('--prod') ? 'prod' : args.has('--dev') ? 'dev' : null;
if (!target) {
  console.error('Say which database: --prod or --dev. Add --execute to actually delete.');
  process.exit(2);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }),
);
const url = target === 'prod' ? env.PROD_SUPABASE_URL : env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = target === 'prod' ? env.PROD_SUPABASE_SERVICE_ROLE_KEY : env.SUPABASE_SERVICE_ROLE_KEY;
const dbPassword = target === 'prod' ? env.PROD_SUPABASE_DB_PASSWORD : env.SUPABASE_DB_PASSWORD;
const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)[1];
const host = target === 'prod' ? 'aws-0-us-east-2.pooler.supabase.com' : 'aws-1-us-east-2.pooler.supabase.com';

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function sql(query) {
  return execSync(`psql -h ${host} -U postgres.${ref} -d postgres -q -t -A -F'|' -c ${JSON.stringify(query)}`, {
    env: { ...process.env, PGPASSWORD: dbPassword },
    encoding: 'utf8',
  }).trim();
}

const USER_BUCKETS = ['avatars', 'banners', 'artist-photos', 'artist-videos', 'listing-images', 'chat-attachments', 'gallery-avatars', 'gallery-banners'];

// ---------------------------------------------------------------- inventory
const users = sql(`select u.id, u.email, coalesce(p.role,'?') from auth.users u left join profiles p on p.id=u.id order by u.created_at`)
  .split('\n').filter(Boolean).map((l) => { const [id, email, role] = l.split('|'); return { id, email, role }; });
const keep = users.filter((u) => u.role === 'admin');
const purge = users.filter((u) => u.role !== 'admin');

const counts = () => Object.fromEntries(
  sql(`select relname, n_live_tup from pg_stat_user_tables where schemaname='public' and n_live_tup>0 order by relname`)
    .split('\n').filter(Boolean).map((l) => { const [t, n] = l.split('|'); return [t, Number(n)]; }),
);
const before = counts();

const { data: bucketList } = await admin.storage.listBuckets();
const objects = [];
for (const b of bucketList ?? []) {
  if (!USER_BUCKETS.includes(b.name)) continue;
  // listing is per folder; user content is keyed <user id>/<file>, so walk one level.
  const { data: folders } = await admin.storage.from(b.name).list('', { limit: 1000 });
  for (const f of folders ?? []) {
    if (f.id) { objects.push({ bucket: b.name, path: f.name }); continue; }
    const { data: files } = await admin.storage.from(b.name).list(f.name, { limit: 1000 });
    for (const file of files ?? []) objects.push({ bucket: b.name, path: `${f.name}/${file.name}` });
  }
}

console.log(`\n${EXECUTE ? 'EXECUTING' : 'DRY RUN'} against ${target.toUpperCase()} (${ref})\n`);
console.log('Accounts to KEEP:');
for (const u of keep) console.log(`  ${u.email}  (${u.role})`);
console.log('Accounts to DELETE:');
for (const u of purge) console.log(`  ${u.email}  (${u.role})`);
console.log('\nRows now:', before);
console.log(`\nStorage objects to delete: ${objects.length}`);
for (const o of objects) console.log(`  ${o.bucket}/${o.path}`);
console.log('\nReference data kept: tags =', sql(`select count(*) from tags`));

if (!EXECUTE) {
  console.log('\nDry run only. Re-run with --execute to delete the above.');
  process.exit(0);
}

// ---------------------------------------------------------------- execute
console.log('\n1. commissions first (NO ACTION on conversation_id blocks the user cascade otherwise)');
sql(`delete from commissions`);

console.log('2. auth users (profiles and everything under them cascade)');
for (const u of purge) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) { console.error(`   FAILED ${u.email}: ${error.message}`); process.exit(1); }
  console.log(`   deleted ${u.email}`);
}

console.log('3. rows that only SET NULL on a user delete, and the admin\'s tester-era notifications');
sql(`delete from analytics_events`);
sql(`delete from notifications`);
sql(`delete from drip_emails_sent`);

console.log('4. storage');
const byBucket = {};
for (const o of objects) (byBucket[o.bucket] ??= []).push(o.path);
for (const [bucket, paths] of Object.entries(byBucket)) {
  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) { console.error(`   FAILED ${bucket}: ${error.message}`); process.exit(1); }
  console.log(`   ${bucket}: removed ${paths.length}`);
}

const after = counts();
console.log('\nRows after:', after);
const remainingUsers = sql(`select count(*) from auth.users`);
console.log(`auth.users remaining: ${remainingUsers} (expected ${keep.length})`);
const leftovers = Object.entries(after).filter(([t]) => t !== 'tags');
if (leftovers.length) console.log('Tables still holding rows (review):', leftovers);
else console.log('Only `tags` remains. Clean.');
