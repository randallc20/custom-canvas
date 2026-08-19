import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Per-route rate limits (requests per minute). Tune as needed.
const LIMITS: Record<string, number> = {
  '/api/conversations': 60, // messaging
  '/api/messages': 120, // chat can burst
  '/api/listings': 30, // catalog cleanup sessions burst above 10
  '/api/commissions': 5,
  '/api/reports': 5,
  '/api/reviews': 5,
  '/api/payments': 10,
  '/api/feed': 120,
};
const DEFAULT_LIMIT = 60;
const WINDOW_MS = 60_000;

function limitFor(pathname: string): number {
  for (const prefix in LIMITS) {
    if (pathname.startsWith(prefix)) return LIMITS[prefix];
  }
  return DEFAULT_LIMIT;
}

// --- Global limiter (Upstash Redis) -----------------------------------------
// Active in production once UPSTASH_REDIS_REST_URL/TOKEN are set. Unlike the
// in-memory fallback below, this is shared across every serverless instance, so
// a burst spread over many cold-started lambdas is actually caught. One limiter
// is built per distinct limit value and reused across requests.
const upstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = upstashConfigured ? Redis.fromEnv() : null;
const limiterCache = new Map<number, Ratelimit>();

function globalLimiter(limit: number): Ratelimit | null {
  if (!redis) return null;
  let rl = limiterCache.get(limit);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, '60 s'),
      prefix: 'cc:rl',
      analytics: false,
      // Without this the default is 5s — a slow (not down) Upstash would
      // stall EVERY API request in middleware. On timeout the request is
      // allowed through (fail open).
      timeout: 1000,
    });
    limiterCache.set(limit, rl);
  }
  return rl;
}

// --- In-memory fallback -----------------------------------------------------
// Best-effort per-instance protection when Upstash isn't configured (local dev,
// or before the prod env vars land). Vercel runs many ephemeral instances, so
// this does NOT enforce a true global limit — it's a floor, not a ceiling.
const hits = new Map<string, number[]>();

function memoryAllows(key: string, limit: number): boolean {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  hits.set(key, timestamps);
  return true;
}

const TOO_FAST = { error: "You're doing that a bit too fast. Please slow down and try again." };

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  // Stripe webhooks are authenticated by signature and must never be throttled.
  if (pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron')) return NextResponse.next();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = limitFor(pathname);
  const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}`;

  const rl = globalLimiter(limit);
  if (rl) {
    try {
      const { success } = await rl.limit(key);
      if (!success) return NextResponse.json(TOO_FAST, { status: 429 });
      return NextResponse.next();
    } catch (err) {
      // Redis unreachable/misconfigured — never fail an API request over
      // rate-limiting infrastructure; fall through to the in-memory floor.
      // But say so: a rotated token would otherwise degrade silently forever.
      console.error('[ratelimit] Upstash error — using in-memory floor:', (err as Error)?.message);
    }
  }

  if (!memoryAllows(key, limit)) return NextResponse.json(TOO_FAST, { status: 429 });
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
