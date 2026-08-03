import { NextRequest, NextResponse } from 'next/server';

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

// In-memory sliding window. NOTE: Vercel runs many ephemeral instances, so this
// is best-effort per-instance protection. For global limits, swap in Upstash
// Ratelimit + Vercel KV (UPSTASH_REDIS_REST_URL/TOKEN) here.
const hits = new Map<string, number[]>();

function limitFor(pathname: string): number {
  for (const prefix in LIMITS) {
    if (pathname.startsWith(prefix)) return LIMITS[prefix];
  }
  return DEFAULT_LIMIT;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  // Stripe webhooks are authenticated by signature and must never be throttled.
  if (pathname.startsWith('/api/webhooks') || pathname.startsWith('/api/cron')) return NextResponse.next();

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = limitFor(pathname);
  const key = `${ip}:${pathname.split('/').slice(0, 3).join('/')}`;
  const now = Date.now();

  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= limit) {
    return NextResponse.json(
      { error: 'You\'re doing that a bit too fast. Please slow down and try again.' },
      { status: 429 }
    );
  }
  timestamps.push(now);
  hits.set(key, timestamps);

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
