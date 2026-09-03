import { describe, it, expect } from 'vitest';
import { isSafeInternalPath } from './safePath';

// The open-redirect guard for the login `returnUrl` and the auth-callback
// `next`. A regex edit here reopens `//evil.com` on a page that redirects
// after authenticating, which is the whole point of pinning it.
// (05-P3 "tests", item 4.)

describe('isSafeInternalPath — rejects off-origin targets', () => {
  const offOrigin = [
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/pwn?x=1'],
    ['backslash pair', '/\\evil.com'],
    ['backslash pair, doubled', '/\\\\evil.com'],
    ['absolute https', 'https://evil.com'],
    ['absolute http', 'http://evil.com/studio'],
    ['scheme-ish, no slash', 'javascript:alert(1)'],
    ['data URL', 'data:text/html,<script>alert(1)</script>'],
    ['bare host', 'evil.com'],
    ['relative path', 'studio'],
    ['tab smuggling', '/\t//evil.com'],
    ['newline smuggling', '/\n//evil.com'],
    ['carriage-return smuggling', '/\r//evil.com'],
    ['NUL smuggling', '/\x00//evil.com'],
    ['DEL smuggling', '/\x7f//evil.com'],
    ['tab between the slashes', '/\t/evil.com'],
    ['space then slash', '/ /evil.com'],
    ['backslash anywhere', '/studio\\..\\evil.com'],
  ] as const;

  for (const [name, value] of offOrigin) {
    it(`rejects ${name}: ${JSON.stringify(value)}`, () => {
      expect(isSafeInternalPath(value)).toBe(false);
    });
  }

  it('rejects empty, null and undefined', () => {
    expect(isSafeInternalPath('')).toBe(false);
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
  });

  // Percent-encoded slashes are NOT decoded by the guard, and must not be:
  // '/%2F%2Fevil.com' stays on this origin as a path segment. Pinned so a
  // "let's decodeURIComponent first" edit has to argue with a test.
  it('treats %2F%2F as an ordinary path, not a protocol-relative URL', () => {
    expect(isSafeInternalPath('/%2F%2Fevil.com')).toBe(true);
    expect(new URL('/%2F%2Fevil.com', 'https://customcanvas.shop').host).toBe('customcanvas.shop');
  });

  // The rejected forms really do resolve off-origin (or fail to resolve) —
  // the reason each one is on the list, not just an assertion about a regex.
  it('every rejected absolute/relative form leaves this origin when resolved', () => {
    const base = 'https://customcanvas.shop';
    for (const form of ['//evil.com', '/\\evil.com', 'https://evil.com', '/\t//evil.com', '/\n//evil.com']) {
      expect(new URL(form, base).host).toBe('evil.com');
    }
  });
});

describe('isSafeInternalPath — accepts real in-app destinations', () => {
  const ok = [
    '/',
    '/studio',
    '/studio?x=1',
    '/studio?x=1&y=2',
    '/listing/4a5937f5-cb94-4522-83d8-eb3b5161fd33',
    '/artist/claire-nguyen',
    '/orders?success=true',
    '/messages/abc#latest',
    '/account',
  ];

  for (const value of ok) {
    it(`accepts ${JSON.stringify(value)}`, () => {
      expect(isSafeInternalPath(value)).toBe(true);
      expect(new URL(value, 'https://customcanvas.shop').host).toBe('customcanvas.shop');
    });
  }

  it('narrows the type for callers', () => {
    const raw: string | null = '/studio?x=1';
    if (isSafeInternalPath(raw)) {
      const narrowed: string = raw;
      expect(narrowed).toBe('/studio?x=1');
    }
  });
});
