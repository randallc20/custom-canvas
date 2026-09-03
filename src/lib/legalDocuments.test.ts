import { describe, expect, it } from 'vitest';
import { dmcaAgentPending, LEGAL_DOCUMENTS, loadLegalDocument } from './legalDocuments';
import {
  ARTIST_AGREEMENT_VERSION,
  PRIVACY_VERSION,
  SELLER_PROTECTION_VERSION,
  TERMS_OF_SALE_VERSION,
  TERMS_VERSION,
} from './agreement';

/** The eight pages are the markdown files. If a document is replaced with a
 *  new counsel version and the identity line changes shape, these fail here
 *  rather than at build on Vercel or, worse, as a page rendering a version
 *  line it invented. */
describe('legal documents', () => {
  it('has all eight documents', () => {
    expect(LEGAL_DOCUMENTS).toHaveLength(8);
  });

  it.each(LEGAL_DOCUMENTS.map((d) => d.slug))('%s loads, parses and strips its header', (slug) => {
    const doc = loadLegalDocument(slug);

    expect(doc.version).toMatch(/^\d+\.\d+$/);
    expect(doc.effective).toBe('September 3, 2026');

    // The page prints its own H1 and version line; the body must not repeat
    // them or the rendered page shows the title twice.
    expect(doc.body.startsWith('# ')).toBe(false);
    expect(doc.body).not.toMatch(/Version\s+\d+\.\d+\s+·\s+Effective/);
    expect(doc.body.length).toBeGreaterThan(1000);
  });

  it('records the versions acceptance is stamped against', () => {
    // L2 stamps profiles.terms_version etc. from constants; if counsel ships
    // a new version of one of these, that constant has to move with it.
    const version = (slug: (typeof LEGAL_DOCUMENTS)[number]['slug']) => loadLegalDocument(slug).version;
    expect(version('terms')).toBe('2.0');
    expect(version('terms-of-sale')).toBe('2.0');
    expect(version('artist-agreement')).toBe('2.0');
    expect(version('privacy')).toBe('2.0');
    expect(version('seller-protection')).toBe('1.0');
    expect(version('listing-standards')).toBe('1.0');
    expect(version('shipping-returns')).toBe('1.0');
    expect(version('dmca')).toBe('1.0');
  });

  it('unknown slug throws rather than rendering an empty page', () => {
    // @ts-expect-error deliberately off the union
    expect(() => loadLegalDocument('nope')).toThrow(/Unknown legal document/);
  });
});

describe('DMCA designated agent (A4 / L11)', () => {
  it('no page publishes an unfilled counsel placeholder', () => {
    for (const d of LEGAL_DOCUMENTS) {
      expect(loadLegalDocument(d.slug).body).not.toMatch(
        /\[(NAME OR POSITION|TELEPHONE NUMBER|DEDICATED DMCA EMAIL)\]/,
      );
    }
  });

  it('substitutes the interim block while the agent is unregistered', () => {
    const body = loadLegalDocument('dmca').body;
    if (dmcaAgentPending()) {
      expect(body).toContain("Our designated agent's details are being registered");
      expect(body).toContain('support@customcanvas.shop');
      // The rest of the section must survive the splice.
      expect(body).toContain('Notices sent to this agent');
      expect(body).toContain('Misuse warning');
    } else {
      // L11 landed: counsel's real agent block publishes as written.
      expect(body).not.toContain("Our designated agent's details are being registered");
    }
  });
});

describe('acceptance constants track the documents', () => {
  it('every recorded version equals the version in the markdown it names', () => {
    // The acceptance record is stamped with these constants. If counsel ships
    // a new version of a document and the constant does not move with it, the
    // product records an acceptance of a version nobody was shown — and the
    // re-acceptance interstitial never fires. Fail here instead.
    expect(TERMS_VERSION).toBe(loadLegalDocument('terms').version);
    expect(TERMS_OF_SALE_VERSION).toBe(loadLegalDocument('terms-of-sale').version);
    expect(ARTIST_AGREEMENT_VERSION).toBe(loadLegalDocument('artist-agreement').version);
    expect(SELLER_PROTECTION_VERSION).toBe(loadLegalDocument('seller-protection').version);
    expect(PRIVACY_VERSION).toBe(loadLegalDocument('privacy').version);
  });
});
