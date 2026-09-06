import { describe, expect, it } from 'vitest';
import { sentryEnvironment } from './sentryEnvironment';

describe('sentryEnvironment', () => {
  it('names the live domain production', () => {
    expect(sentryEnvironment('https://customcanvas.shop', 'production')).toBe('production');
  });
  it('names a vercel.app deployment staging — even though its NODE_ENV is production', () => {
    // The bug: staging and prod both tagged `production`, so the e2e suite
    // running against staging paged like a live incident.
    expect(sentryEnvironment('https://custom-canvas-chi.vercel.app', 'production')).toBe('staging');
  });
  it('names localhost development regardless of NODE_ENV', () => {
    expect(sentryEnvironment('http://localhost:3000', 'production')).toBe('development');
  });
  it('falls back to NODE_ENV when no URL is configured', () => {
    expect(sentryEnvironment(undefined, 'test')).toBe('test');
    expect(sentryEnvironment('not a url', 'production')).toBe('production');
  });
});
