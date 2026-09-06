/**
 * Which Sentry environment a deployment reports as.
 *
 * NODE_ENV is 'production' on EVERY Vercel deployment, including staging
 * (custom-canvas-chi.vercel.app), so both projects reported into one Sentry
 * project as `environment=production` and staging's e2e noise paged like a
 * prod incident (2026-09-06). The deployment's public URL is the one thing
 * that differs between them, and it is already configured on both.
 */
export function sentryEnvironment(
  appUrl: string | undefined = process.env.NEXT_PUBLIC_APP_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  let host = '';
  try { host = new URL(appUrl ?? '').hostname; } catch { /* no URL configured */ }
  if (host === 'customcanvas.shop') return 'production';
  if (host.endsWith('.vercel.app')) return 'staging';
  if (host === 'localhost') return 'development';
  return nodeEnv ?? 'development';
}
