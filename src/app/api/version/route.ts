import { NextResponse } from 'next/server';

// Deploy identity for CI: the e2e job polls this until the deployed SHA
// matches the commit under test — otherwise it can green-light the PREVIOUS
// deployment (Vercel deploy and GitHub Actions race on every master push).
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    env: process.env.VERCEL_ENV ?? 'local',
  });
}
