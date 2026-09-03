#!/usr/bin/env node
/**
 * Block until staging serves a NEW build.
 *
 * Vercel auto-deploys master, but the old build keeps answering for a couple
 * of minutes — long enough to run the whole e2e suite against the code you
 * just replaced and believe the result. This fingerprints the homepage by the
 * set of /_next/static script URLs and waits for that fingerprint to change
 * (or, with --expect <hash>, to reach a known one).
 *
 *   node scripts/wait-for-staging.mjs              # print current fingerprint
 *   node scripts/wait-for-staging.mjs --wait <old> # block until it differs
 */
import { createHash } from 'node:crypto';

const BASE = process.env.E2E_BASE_URL ?? 'https://custom-canvas-chi.vercel.app';

async function fingerprint() {
  const res = await fetch(BASE, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
  const html = await res.text();
  const scripts = [...html.matchAll(/\/_next\/static\/[^"']+/g)].map((m) => m[0]).sort();
  if (!scripts.length) throw new Error(`no /_next/static assets in ${BASE} (status ${res.status})`);
  return createHash('sha256').update(scripts.join('\n')).digest('hex').slice(0, 12);
}

const waitIdx = process.argv.indexOf('--wait');
if (waitIdx === -1) {
  console.log(await fingerprint());
  process.exit(0);
}

const previous = process.argv[waitIdx + 1];
const deadline = Date.now() + 15 * 60_000;
process.stderr.write(`waiting for staging to move off ${previous} ...\n`);
for (;;) {
  let current;
  try {
    current = await fingerprint();
  } catch (err) {
    process.stderr.write(`  (${err.message})\n`);
  }
  if (current && current !== previous) {
    process.stderr.write(`staging is serving ${current}\n`);
    console.log(current);
    process.exit(0);
  }
  if (Date.now() > deadline) {
    process.stderr.write('timed out after 15 minutes — check the Vercel deployment\n');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
