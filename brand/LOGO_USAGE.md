# Custom Canvas — Logo Usage

Mark v2 — "Loaded brush." Two concentric C's drawn as single brush strokes:
the ink outer C (the gallery) holding the terra inner C (the art inside it).
Each stroke lands loaded and blunt, thins as the paint depletes, and breaks
into tapering dry-brush ribbons at the tail. Each C is a single closed
filled SVG path — no strokes, filters, gradients, or masks. The wordmark is
Fraunces 600 (opsz 48), converted to outlines; the contrast between the
painted mark and the set type is intentional. Do not redraw the wordmark
with brush effects.

## File map

```
brand/
  logo-mark.svg               Mark only, full color (ink outer / terra inner)
  logo-mark-ink.svg           Mark only, all ink
  logo-mark-cream.svg         Mark only, all cream
  logo-horizontal.svg         Mark + wordmark side by side, full color
  logo-horizontal-ink.svg     Horizontal, all ink
  logo-horizontal-cream.svg   Horizontal, all cream
  logo-stacked.svg            Mark above wordmark, centered, full color
  logo-stacked-ink.svg        Stacked, all ink
  logo-stacked-cream.svg      Stacked, all cream
  brand-sheet.svg / .png      Reference sheet: lockups on cream, terra, ink
public/
  favicon.svg                 Simplified heavy mark (no dry-brush detail)
  favicon.ico                 16 + 32 + 48 px, from the simplified mark
  apple-touch-icon.png        180×180, full-color mark on solid cream
  og-default.png              1200×630, stacked mark on cream + tagline
  email-logo.png              Horizontal lockup @2x (720×176, renders 360×88)
  icons/icon-192.png          Cream mark on terra
  icons/icon-512.png          Cream mark on terra
  icons/icon-512-maskable.png Cream mark on terra, content within 80% safe zone
stripe-branding/
  stripe-icon.png             512×512 square, full-color mark on cream
  stripe-logo.png             Horizontal lockup, transparent background
```

## Variant rules

- **Full color** (ink + terra): on cream `#FAF6F0`, white-adjacent, or sand
  `#F1E8DA` backgrounds only.
- **All ink**: light backgrounds where a single color is required (print,
  embossing, single-color partners).
- **All cream**: on terra `#E8704A`, ink `#2D2A26`, sage `#7C8B6F`, or
  photography.
- **Never** place the full-color mark on terra — the inner C disappears.
- Never recolor outside the palette; never use pure black `#000` or pure
  white `#FFF`.
- Do not add drop shadows, outlines, or texture overlays; the dry-brush
  detail is part of the artwork, not a style to be extended.

## Clear space

Keep a clear zone of **half the mark's height** (0.5×) on all sides of any
lockup, measured from the mark's bounding box. Nothing — text, rules, page
edges — inside that zone. The depleted tail at the lower right of the mark
counts as part of the mark; measure clear space from the tips of the
trailing ribbons.

## Minimum sizes

- Mark alone: **24 px** (full mark with dry-brush tail).
- Below 24 px, use the simplified favicon mark (`public/favicon.svg`) —
  the depletion detail is removed and weights are heavier so the two C's
  stay legible at 16 px.
- Horizontal lockup: **120 px** wide.
- Stacked lockup: **80 px** wide.
- Print: mark no smaller than 10 mm.

## Raster regeneration commands

All PNGs are rendered from the SVG sources. To regenerate after editing
(requires `cairosvg` and `Pillow`; `pip install cairosvg pillow`):

```bash
# brand sheet
python3 -c "import cairosvg; cairosvg.svg2png(url='brand/brand-sheet.svg', \
  write_to='brand/brand-sheet.png', output_width=1360, output_height=840)"

# favicon.ico (renders favicon.svg at 48/32/16 and bundles)
python3 - <<'PY'
import cairosvg; from PIL import Image
imgs=[]
for s in (48,32,16):
    cairosvg.svg2png(url='public/favicon.svg', write_to=f'/tmp/f{s}.png',
                     output_width=s, output_height=s)
    imgs.append(Image.open(f'/tmp/f{s}.png'))
imgs[0].save('public/favicon.ico',
             sizes=[(48,48),(32,32),(16,16)], append_images=imgs[1:])
PY

# app icons (cream mark on terra; maskable keeps content inside 80%)
# see build notes: render brand/logo-mark-cream.svg onto a #E8704A square,
# mark sized to 78% of the canvas (62% for the maskable variant), centered
# on the mark's visual bounding box.

# email logo @2x
python3 -c "import cairosvg; cairosvg.svg2png(url='brand/logo-horizontal.svg', \
  write_to='public/email-logo.png', output_height=176)"
```

Tagline for social/OG use: "Original art from Houston's emerging artists".
