/**
 * Guard for redirect targets that must stay on this origin (login returnUrl,
 * auth-callback next). A bare leading-slash check is NOT enough:
 * '//evil.com' and '/\evil.com' resolve off-origin, and so does
 * '/\t//evil.com' — URL parsing strips tabs/newlines, so a control character
 * after the slash smuggles a protocol-relative URL past a '/^\/(?![/\\])/'
 * regex. Require a leading slash, then reject a second slash, any backslash,
 * and any whitespace/control character anywhere in the value.
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/')) return false;
  if (path.startsWith('//') || path.includes('\\')) return false;
  if (/[\s\x00-\x1f\x7f]/.test(path)) return false;
  return true;
}
