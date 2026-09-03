import type { Metadata } from 'next';
import fs from 'node:fs';
import path from 'node:path';

/** The eight counsel-reviewed documents, published straight from the markdown
 *  in the repo. The files under `docs/legal/website legal documents/markdown/`
 *  ARE the pages — there is no transcription step, because the three
 *  hand-written JSX bodies that used to stand in for three of these had all
 *  drifted out of date by the time counsel's final set landed (L1).
 *
 *  Adding a document: drop the markdown in that directory, add a row here,
 *  and add a `page.tsx` that calls <LegalDocument slug="..." />. */
export type LegalSlug =
  | 'terms'
  | 'terms-of-sale'
  | 'privacy'
  | 'shipping-returns'
  | 'seller-protection'
  | 'listing-standards'
  | 'artist-agreement'
  | 'dmca';

export type LegalDocumentMeta = {
  /** Route path, without the leading slash. */
  slug: LegalSlug;
  /** File name under the markdown directory. */
  file: string;
  /** Page <title> and the label used in "See also" and the footer. */
  title: string;
  /** Meta description. */
  description: string;
  /** Kept out of search. The Artist Agreement is public (an artist must be
   *  able to read it before committing) but buyers have no reason to land on
   *  selling terms from a search result. */
  noindex?: boolean;
};

export const LEGAL_DOCUMENTS: readonly LegalDocumentMeta[] = [
  {
    slug: 'terms',
    file: 'terms-of-service.md',
    title: 'Terms of Service',
    description: 'The terms that govern use of Custom Canvas.',
  },
  {
    slug: 'terms-of-sale',
    file: 'terms-of-sale.md',
    title: 'Terms of Sale',
    description: 'The terms that govern buying artwork on Custom Canvas.',
  },
  {
    slug: 'shipping-returns',
    file: 'shipping-returns-refunds.md',
    title: 'Shipping, Returns & Refunds',
    description: 'How refunds, shipping, delivery and returns work on Custom Canvas.',
  },
  {
    slug: 'privacy',
    file: 'privacy-policy.md',
    title: 'Privacy Policy',
    description: 'What Custom Canvas collects, why, who processes it and how long we keep it.',
  },
  {
    slug: 'dmca',
    file: 'dmca-policy.md',
    title: 'DMCA & Copyright Policy',
    description: 'How to report copyright infringement on Custom Canvas.',
  },
  {
    slug: 'seller-protection',
    file: 'seller-protection.md',
    title: 'Seller Protection Policy',
    description: 'When Custom Canvas bears a chargeback instead of the artist.',
  },
  {
    slug: 'listing-standards',
    file: 'listing-standards.md',
    title: 'Listing Standards',
    description: 'What every Custom Canvas listing must tell buyers, and what is not accepted.',
  },
  {
    slug: 'artist-agreement',
    file: 'artist-agreement.md',
    title: 'Artist Agreement',
    description: 'The agreement between an artist and Custom Canvas LLC.',
    noindex: true,
  },
];

const MARKDOWN_DIR = path.join(
  process.cwd(),
  'docs',
  'legal',
  'website legal documents',
  'markdown',
);

export type LoadedLegalDocument = LegalDocumentMeta & {
  /** The document body, with the H1 and the identity/version paragraph
   *  stripped — the page renders those itself as its header. */
  body: string;
  /** e.g. "2.0". */
  version: string;
  /** e.g. "September 3, 2026", verbatim from the document. */
  effective: string;
};

export function legalDocumentMeta(slug: LegalSlug): LegalDocumentMeta {
  const meta = LEGAL_DOCUMENTS.find((d) => d.slug === slug);
  if (!meta) throw new Error(`Unknown legal document: ${slug}`);
  return meta;
}

/** Parse `Version X.Y` and `Effective: <date>` out of the document's identity
 *  paragraph. The paragraph is soft-wrapped in the source and the wrap falls
 *  in a different place in each document — in terms-of-service.md it splits
 *  "Effective:" from the date — so the header block is flattened to one line
 *  before matching. A document without both is a bug, not a soft failure:
 *  every page prints a version line and acceptance is versioned against it. */
function parseVersionLine(markdown: string, file: string): { version: string; effective: string } {
  const header = markdown.split('\n').slice(0, 20).join(' ').replace(/\s+/g, ' ');
  const version = /Version\s+(\d+\.\d+)/.exec(header)?.[1];
  const effective = /Effective:\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/.exec(header)?.[1];
  if (!version || !effective) {
    throw new Error(
      `${file}: could not parse a "Version X.Y · Effective: <date>" line from the first 20 lines`,
    );
  }
  return { version, effective: effective.replace(/\s+/g, ' ') };
}

/** Drop exactly two things the page header already prints: the H1, and the
 *  paragraph carrying "Custom Canvas LLC · … · Version X.Y · Effective: …".
 *  Then drop a horizontal rule if that leaves one stranded at the top.
 *
 *  Nothing else goes. An earlier cut of this sliced everything above the
 *  document's first `---`, which silently swallowed each document's opening
 *  paragraph — the sentence in Terms of Service that says purchases are also
 *  governed by the Terms of Sale, the one in Seller Protection that says it is
 *  part of the Artist Agreement. Those are operative text. The rendered-page
 *  diff in scripts/verify-legal-pages.mjs is what caught it and is what keeps
 *  it caught. */
function stripHeader(markdown: string): string {
  const paragraphs = markdown.split(/\n\s*\n/);
  const kept = paragraphs.filter((p, i) => {
    const t = p.trim();
    if (i === 0 && /^#\s/.test(t)) return false;
    // Only in the header block — a body paragraph that happened to mention a
    // version must survive.
    if (i < 4 && /Version\s+\d+\.\d+/.test(t) && /Effective:/.test(t.replace(/\s+/g, ' '))) return false;
    return true;
  });
  while (kept.length && (/^-{3,}$/.test(kept[0].trim()) || kept[0].trim() === '')) kept.shift();
  return kept.join('\n\n').trim();
}

/** The DMCA document still carries counsel's `[NAME OR POSITION]` /
 *  `[TELEPHONE NUMBER]` / `[DEDICATED DMCA EMAIL]` placeholders (item A4).
 *  Publishing those verbatim would be worse than publishing nothing: a notice
 *  sender would have no address to use, and the page would advertise that the
 *  designated agent is not real. Until the agent is registered with the
 *  Copyright Office and the mailbox exists (L11), the block is replaced with
 *  an interim notice pointing at support@.
 *
 *  This keys on the placeholders, not on a flag — the moment counsel's filled
 *  text lands in the markdown, the real block publishes itself with no code
 *  change. `dmcaAgentPending()` is what L11's acceptance check asserts is
 *  false. */
const DMCA_PLACEHOLDER = /\[(NAME OR POSITION|TELEPHONE NUMBER|DEDICATED DMCA EMAIL)\]/;

const INTERIM_AGENT_BLOCK = `**Designated DMCA Agent**

> Our designated agent's details are being registered with the U.S. Copyright
> Office. Until that registration is complete, send copyright notices and
> counter-notices to **support@customcanvas.shop** with "DMCA" in the subject
> line, and include the six elements listed below. We act on notices sent to
> that address exactly as we would on notices sent to the designated agent.

Custom Canvas LLC
3120 Southwest Freeway, Suite 101 #991985
Houston, Texas 77098`;

function replaceDmcaAgentBlock(body: string): string {
  if (!DMCA_PLACEHOLDER.test(body)) return body;
  // From the agent heading up to (not including) the paragraph that follows
  // the address block.
  return body.replace(
    /\*\*Designated DMCA Agent\*\*[\s\S]*?(?=\n\nNotices sent to this agent)/,
    INTERIM_AGENT_BLOCK,
  );
}

/** True while the DMCA document still has unfilled agent placeholders. */
export function dmcaAgentPending(): boolean {
  return DMCA_PLACEHOLDER.test(
    fs.readFileSync(path.join(MARKDOWN_DIR, legalDocumentMeta('dmca').file), 'utf8'),
  );
}

export function loadLegalDocument(slug: LegalSlug): LoadedLegalDocument {
  const meta = legalDocumentMeta(slug);
  const markdown = fs.readFileSync(path.join(MARKDOWN_DIR, meta.file), 'utf8');
  const { version, effective } = parseVersionLine(markdown, meta.file);
  let body = stripHeader(markdown);
  if (slug === 'dmca') body = replaceDmcaAgentBlock(body);
  return { ...meta, body, version, effective };
}

/** Page metadata for a legal route, from the registry, so title/description/
 *  noindex live in exactly one place. */
export function legalMetadata(slug: LegalSlug): Metadata {
  const meta = legalDocumentMeta(slug);
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `/${meta.slug}` },
    ...(meta.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
