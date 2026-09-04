/**
 * Initials for an avatar or a banner monogram.
 *
 * Lives here rather than in `components/ui/Avatar` because that file is now
 * `'use client'` (it needs state to fall back when an image fails to load),
 * and a SERVER component importing a plain function from a client module gets
 * a client-reference proxy instead — calling it throws
 * `TypeError: (0 , a.Q) is not a function` at render time and the whole page
 * dies. That is exactly what happened to the Partners page: its
 * `BannerFallback` imported `getInitials` from Avatar, and adding the
 * directive turned a static page into a runtime error with no h1 at all.
 * Two e2e tests caught it. A pure helper shared across the boundary belongs
 * outside the boundary.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
