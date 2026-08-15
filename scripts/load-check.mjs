#!/usr/bin/env node
// Load sanity check — NOT a stress test. Fires a bounded burst of GETs at a
// public URL and reports status distribution + latency percentiles, so we can
// confirm normal browsing holds up (feed p95 sane, no unexpected 429s) before a
// public launch. Be a good citizen: default target is the homepage (not rate
// limited); point it at /api/* only deliberately.
//
// Usage:
//   node scripts/load-check.mjs [url] [--n=100] [--concurrency=20]
//   BASE=https://custom-canvas-chi.vercel.app node scripts/load-check.mjs

const args = process.argv.slice(2);
const positional = args.find((a) => !a.startsWith('--'));
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const BASE = process.env.BASE || 'https://custom-canvas-chi.vercel.app';
const url = positional || BASE;
const total = parseInt(flag('n', '100'), 10);
const concurrency = parseInt(flag('concurrency', '20'), 10);

const latencies = [];
const statuses = {};
let done = 0;

async function one() {
  const start = performance.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'cc-load-check' } });
    await res.arrayBuffer(); // include full body transfer in the timing
    statuses[res.status] = (statuses[res.status] || 0) + 1;
  } catch (err) {
    statuses[`ERR:${err.code || err.name}`] = (statuses[`ERR:${err.code || err.name}`] || 0) + 1;
  }
  latencies.push(performance.now() - start);
  done += 1;
}

async function worker() {
  while (done + inFlight() < total) {
    started += 1;
    await one();
  }
}

let started = 0;
const inFlight = () => started - done;

function pct(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

const runStart = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const wall = (performance.now() - runStart) / 1000;

const sorted = [...latencies].sort((a, b) => a - b);
const ms = (n) => `${n.toFixed(0)}ms`;

console.log(`\nLoad check → ${url}`);
console.log(`requests=${total} concurrency=${concurrency} wall=${wall.toFixed(1)}s throughput=${(total / wall).toFixed(1)} req/s`);
console.log(`status: ${Object.entries(statuses).map(([k, v]) => `${k}×${v}`).join('  ')}`);
console.log(`latency: p50=${ms(pct(sorted, 50))} p95=${ms(pct(sorted, 95))} p99=${ms(pct(sorted, 99))} max=${ms(sorted[sorted.length - 1] || 0)}`);

const ok = (statuses['200'] || 0) === total;
const has429 = Object.keys(statuses).some((k) => k === '429');
if (!ok) console.log(`\n⚠️  not all requests were 200 — investigate the status line above`);
if (has429) console.log(`⚠️  saw 429s — rate limiter engaged (expected if you targeted an /api/* route)`);
process.exit(ok ? 0 : 1);
