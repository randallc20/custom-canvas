# Scripts

## seed_demo.py
Seeds staging with realistic demo data — Houston artists, a verified gallery +
school partner (with an alumni education link), varied listings (available/sold,
shipping/pickup), reviews, follows, and saves. Images are generated abstract
placeholders, not real artwork.

```bash
pip install Pillow
python3 scripts/seed_demo.py   # reads keys from .env.local
```

Idempotent guard: exits if `ada-rivera` already exists. To reseed, delete the
`@cc-demo.com` auth users in Supabase first (FK cascades clear their data).

Demo password: `DemoPass123!` — accounts `<slug>@cc-demo.com`,
`demo.collector@cc-demo.com`, `bayou-city-gallery@cc-demo.com`,
`glassell-school@cc-demo.com`.
