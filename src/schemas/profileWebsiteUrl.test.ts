import { describe, it, expect } from 'vitest';
import { galleryProfileSchema } from './gallerySchema';
import { artistProfileSchema } from './artistSchema';

const gallery = { gallery_name: 'Test Gallery', partner_type: 'gallery' as const, city: 'Houston' };
const artist = {
  display_name: 'Test Artist', city: 'Houston', commissions_open: false,
  accent_color: '#123456', bio_layout: 'left' as const,
};

describe('website_url scheme rule (mirrors DB CHECK *_website_url_scheme, 00052)', () => {
  const cases: [string, boolean][] = [
    ['https://example.com', true],
    ['http://example.com/path?q=1', true],
    ['HTTPS://EXAMPLE.COM', true],
    ['', true],
    ['javascript:alert(document.cookie)', false],
    ['data:text/html,hi', false],
    ['ftp://example.com', false],
    ['example.com', false],
  ];

  for (const [schema, base, label] of [
    [galleryProfileSchema, gallery, 'gallery'],
    [artistProfileSchema, artist, 'artist'],
  ] as const) {
    for (const [url, ok] of cases) {
      it(`${label}: ${JSON.stringify(url)} -> ${ok ? 'accepted' : 'rejected'}`, () => {
        const r = schema.safeParse({ ...base, website_url: url });
        expect(r.success).toBe(ok);
        if (!r.success) expect(r.error.issues[0].path).toEqual(['website_url']);
      });
    }
  }

  it('omitted website_url is accepted on both', () => {
    expect(galleryProfileSchema.safeParse(gallery).success).toBe(true);
    expect(artistProfileSchema.safeParse(artist).success).toBe(true);
  });
});
