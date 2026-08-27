// E2E fixture seeder (P3 of docs/HARDENING-AND-POLISH-PLAN.md).
//
// Prepares the DEV Supabase project for a full suite run and prints a
// ready-to-eval env export block on STDOUT (progress goes to stderr), so
// scripts/run-e2e.sh can do:  eval "$(node scripts/seed-e2e.mjs)"
//
// What it does, per run:
//   - deletes stale e2e.admin.* / e2e.draft.* / e2e.guard.* users from prior
//     runs (the guard-wizard and approval-flow tests CONSUME their fixtures)
//   - resets the three long-lived seed accounts to one fresh password
//   - creates a fresh admin (signup trigger row promoted to role=admin)
//   - creates a fresh DRAFT artist that passes the submit gate: avatar +
//     120-char story + agreement 1.0 + one listing (approval-flow needs it)
//   - creates the two guard fixtures (artist with no artist_profiles row,
//     gallery with no gallery_profiles row)
//
// Never point this at prod: it uses the DEV service-role key from .env.local.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const { createClient } = createRequire(join(repo, 'package.json'))('@supabase/supabase-js');

const env = Object.fromEntries(
  readFileSync(join(repo, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const log = (...a) => console.error('seed-e2e:', ...a);
const PASSWORD = 'E2e-' + randomBytes(6).toString('base64url') + '-Aa1';
const TS = Date.now().toString(36);

async function allUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

const users = await allUsers();
const byEmail = new Map(users.map((u) => [u.email, u]));

// 1. Clear consumed fixtures and throwaways from prior runs. Everything
//    e2e.*@ is disposable test-bed state (the long-lived seed accounts are
//    artist.test@ / buyer.test@ / bayou-city-gallery@, not e2e.*).
const stale = users.filter((u) => /^e2e\./.test(u.email ?? ''));
for (const u of stale) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) log(`could not delete stale ${u.email}: ${error.message}`);
  else log(`deleted stale ${u.email}`);
}

// 1b. Aborted runs orphan the env artist's throwaway listings (a completed
//     admin-safety run deletes its own) — sweep them so the public staging
//     feed doesn't fill with "E2E Safety Canvas" debris.
// (RT2 rows with orders attached refuse deletion via FK — logged, kept.)
for (const pattern of ['E2E Safety Canvas %', 'RT2 Morning in Montrose %']) {
  const { data: gone, error } = await admin
    .from('listings')
    .delete()
    .like('title', pattern)
    .select('id');
  if (error) log(`throwaway-listing sweep failed (${pattern}): ${error.message}`);
  else if (gone?.length) log(`deleted ${gone.length} orphaned '${pattern}' listings`);
}

// 2. One fresh password for the long-lived seed accounts.
const SEED_ACCOUNTS = [
  'artist.test@customcanvas.dev',   // LIVE approved artist
  'buyer.test@customcanvas.dev',    // buyer with order history
  'bayou-city-gallery@cc-demo.com', // verified partner
];
for (const email of SEED_ACCOUNTS) {
  const user = byEmail.get(email);
  if (!user) throw new Error(`seed account missing on DEV: ${email} — reseed the demo data first`);
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
  if (error) throw error;
  log(`password reset: ${email}`);
}

async function createUser(email, metadata) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: metadata,
  });
  if (error) throw error;
  return data.user;
}

// 3. Fresh admin — the signup trigger writes the profiles row; promote it.
const adminEmail = `e2e.admin.${TS}@customcanvas.dev`;
const adminUser = await createUser(adminEmail, { role: 'user', full_name: 'E2E Admin' });
{
  const { data, error } = await admin.from('profiles')
    .update({ role: 'admin' }).eq('id', adminUser.id).select('id').maybeSingle();
  if (error || !data) throw error ?? new Error('admin promotion updated zero rows');
  log(`admin created: ${adminEmail}`);
}

// 4. Fresh DRAFT artist that passes the submit gate.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsAtmEhMbywi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgvejeE8mULd4AAAAABJRU5ErkJggg==',
  'base64'
);
const draftEmail = `e2e.draft.${TS}@customcanvas.dev`;
const draftUser = await createUser(draftEmail, { role: 'artist', full_name: 'E2E Draft Artist' });
{
  const avatarPath = `e2e/${TS}.png`;
  const { error: upErr } = await admin.storage.from('avatars')
    .upload(avatarPath, TINY_PNG, { contentType: 'image/png' });
  if (upErr) throw upErr;
  const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(avatarPath);

  const { data: prof, error: avErr } = await admin.from('profiles')
    .update({ avatar_url: publicUrl }).eq('id', draftUser.id).select('id').maybeSingle();
  if (avErr || !prof) throw avErr ?? new Error('avatar update matched zero rows');

  // The submit gate (api/artist/submit): avatar + story >= 100 chars +
  // agreement at the current version + at least one listing.
  const { data: artistRow, error: apErr } = await admin.from('artist_profiles').insert({
    profile_id: draftUser.id,
    slug: `e2e-draft-${TS}`,
    display_name: 'E2E Draft Artist',
    story: 'I paint the bayous and freeways of Houston in oil and gouache, chasing the light that only shows up over concrete after a storm has washed everything clean.',
    agreement_accepted_at: new Date().toISOString(),
    agreement_version: '1.0',
  }).select('id').single();
  if (apErr) throw apErr;

  const { error: listErr } = await admin.from('listings').insert({
    artist_id: artistRow.id,
    title: `Bayou Study ${TS}`,
    medium: 'Oil on panel',
    price_cents: 12500,
  });
  if (listErr) throw listErr;
  log(`draft artist created: ${draftEmail}`);
}

// 5. Guard fixtures: the role exists, the wizard has not been finished.
const noProfileEmail = `e2e.guard.noprofile.${TS}@customcanvas.dev`;
await createUser(noProfileEmail, { role: 'artist', full_name: 'E2E Guard NoProfile' });
const noGalleryEmail = `e2e.guard.nogallery.${TS}@customcanvas.dev`;
await createUser(noGalleryEmail, { role: 'gallery', full_name: 'E2E Guard NoGallery' });
log(`guard fixtures created: ${noProfileEmail}, ${noGalleryEmail}`);

log('done — eval the export block below');

// STDOUT: the env contract of the specs (see each spec's header comment).
console.log(`export E2E_ARTIST_EMAIL='artist.test@customcanvas.dev'`);
console.log(`export E2E_ARTIST_PASSWORD='${PASSWORD}'`);
console.log(`export E2E_BUYER_EMAIL='buyer.test@customcanvas.dev'`);
console.log(`export E2E_BUYER_PASSWORD='${PASSWORD}'`);
console.log(`export E2E_ADMIN_EMAIL='${adminEmail}'`);
console.log(`export E2E_ADMIN_PASSWORD='${PASSWORD}'`);
console.log(`export E2E_DRAFT_ARTIST_EMAIL='${draftEmail}'`);
console.log(`export E2E_DRAFT_ARTIST_PASSWORD='${PASSWORD}'`);
console.log(`export E2E_GUARD_PASSWORD='${PASSWORD}'`);
console.log(`export E2E_GUARD_NO_PROFILE_EMAIL='${noProfileEmail}'`);
console.log(`export E2E_GUARD_ARTIST_EMAIL='artist.test@customcanvas.dev'`);
console.log(`export E2E_GUARD_NO_GALLERY_EMAIL='${noGalleryEmail}'`);
console.log(`export E2E_GUARD_GALLERY_EMAIL='bayou-city-gallery@cc-demo.com'`);
