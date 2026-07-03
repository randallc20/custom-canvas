import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Directory renamed in Phase 4; old links keep working.
      { source: '/galleries', destination: '/partners', permanent: true },
      // Build 3 Phase 4: artist console consolidated into /studio.
      // (/listings/new and /listings/[id]/edit still exist and are NOT
      // redirected — sources match exact paths only.)
      { source: '/listings', destination: '/studio/work', permanent: false },
      { source: '/series', destination: '/studio/work?tab=series', permanent: false },
      { source: '/sales', destination: '/studio/sales', permanent: false },
      { source: '/payouts', destination: '/studio/sales', permanent: false },
      { source: '/analytics', destination: '/studio?trends=open', permanent: false },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
}, {
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
