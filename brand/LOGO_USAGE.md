# Custom Canvas — Logo usage

The mark is two concentric letter C's: an ink C (the gallery) holding a terra C
(the art inside it). Both C's share one letterform, one stroke weight, and one
opening — they read as a single voice. All text in these files is converted to
paths (Fraunces 600 for the wordmark), so nothing depends on fonts at runtime.

## File map

| File | Goes to | Used for |
|---|---|---|
| brand/logo-mark[.svg/-ink/-cream] | keep in repo (`/brand`) | master art, square icon |
| brand/logo-horizontal[...] | `/brand`, imported in navbar | navbar at 28–32px tall |
| brand/logo-stacked[...] | `/brand` | footer, auth pages |
| public/favicon.svg + favicon.ico | `public/` | browser tabs (ico = 16+32+48) |
| public/apple-touch-icon.png | `public/` | iOS home screen (180², solid cream) |
| public/icons/icon-192.png, icon-512.png | `public/icons/` | PWA manifest |
| public/icons/icon-512-maskable.png | `public/icons/` | manifest `purpose: "maskable"` (cream mark on terra, 80% safe zone) |
| public/og-default.png | `public/` | site-wide OpenGraph/Twitter fallback (1200×630) |
| public/email-logo.png | `public/` (hosted URL) | transactional email header, render at 360×88 CSS px (`width="360"`) |
| stripe-branding/ | upload in Stripe Dashboard → Settings → Branding | hosted checkout icon + logo |
| extras/social-avatar-1024.png | social profiles | Instagram/X/etc. avatar |

## Which variant on which background

- **Full color** (ink + terra): cream `#FAF6F0`, white cards, sand `#F1E8DA`.
- **All-ink**: light backgrounds when terra would clash or in single-color print.
- **All-cream**: terra `#E8704A`, terraDark `#C95A38`, ink `#2D2A26`, photos (dark areas).
- Never recolor to pure black `#000` or pure white `#FFF`; never put full-color on terra (the inner C disappears).

## Clear space and minimum sizes

- **Clear space**: keep a margin equal to the inner C's height (≈ 25% of the
  mark's height) on all sides of any lockup. Nothing else inside it.
- **Minimum sizes**: mark 16px; horizontal lockup 24px tall (navbar renders at
  28–32px — safe); stacked lockup 64px tall. Below these, use the mark alone.
- The favicon files use a slightly heavier stroke (6 vs 5 units) tuned for
  16px rasterization — don't swap in the regular mark.

## Regenerating rasters

Everything regenerates from the SVG masters with one command (needs Python 3
with `fonttools uharfbuzz cairosvg pillow`; fonts are bundled in `fonts/`):

```bash
python scripts/generate-assets.py
```

One-off exports from any SVG master:

```bash
# rsvg-convert
rsvg-convert -w 512 -h 512 brand/logo-mark.svg -o out/logo-mark-512.png
rsvg-convert -w 1200 -h 630 --background-color '#FAF6F0' brand/logo-stacked.svg -o out/og.png

# sharp (node)
npx sharp-cli -i brand/logo-mark.svg -o out/logo-mark-512.png resize 512 512
```

## Next.js wiring

```tsx
// app/layout.tsx metadata
icons: {
  icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }],
  apple: "/apple-touch-icon.png",
},
openGraph: { images: ["/og-default.png"] },
twitter: { card: "summary_large_image", images: ["/og-default.png"] },
```

```json
// manifest icons
[
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
  { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Fonts

Fraunces and DM Sans are bundled under the SIL Open Font License for
regeneration only; shipped SVGs contain outlines, not fonts. Wordmark:
Fraunces 600, opsz 40, SOFT 0, WONK 0, +0.2px tracking.
