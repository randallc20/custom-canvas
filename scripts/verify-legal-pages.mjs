#!/usr/bin/env node
/**
 * L1 Accept: every one of the eight legal routes renders the repo markdown
 * with no divergence.
 *
 * The pages are prerendered static, so the built HTML in `.next/server/app/`
 * IS the published text. This parses each source document with the same
 * markdown parser the page uses (remark + GFM), walks it for every block a
 * reader sees — paragraphs, list items, table cells, headings, blockquotes —
 * and asserts each one's text survives into the built page.
 *
 * Parsing rather than regexing the markdown matters: these documents wrap
 * bold across line breaks and lean on lists heavily, and a regex
 * approximation reports dozens of differences that are its own and none that
 * are the product's. It is what caught the header-stripper swallowing each
 * document's opening paragraph.
 *
 *   ./node_modules/.bin/next build && node scripts/verify-legal-pages.mjs
 *
 * Run after any change to the markdown, to LegalDocument, or to the loader.
 * Exits non-zero on any missing block.
 */
import fs from 'node:fs';
import path from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdToString } from 'mdast-util-to-string';

const DOCS = {
  terms: 'terms-of-service.md',
  'terms-of-sale': 'terms-of-sale.md',
  privacy: 'privacy-policy.md',
  'shipping-returns': 'shipping-returns-refunds.md',
  dmca: 'dmca-policy.md',
  'seller-protection': 'seller-protection.md',
  'listing-standards': 'listing-standards.md',
  'artist-agreement': 'artist-agreement.md',
};
const MD_DIR = 'docs/legal/website legal documents/markdown';
const BUILD_DIR = '.next/server/app';

/** Long dashes, curly quotes and non-breaking spaces survive markdown but are
 *  re-encoded by React; fold both sides onto the same characters. */
const norm = (s) =>
  s
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

function pageText(slug) {
  const file = path.join(BUILD_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found — run "next build" first (and check the route is static).`);
  }
  return norm(
    fs
      .readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      // Inline tags close up to nothing; block tags become a space. Replacing
      // every tag with a space instead turns "<strong>Terms of Sale</strong>;"
      // into "Terms of Sale ;" and reports the whole paragraph as divergent.
      .replace(/<\/?(?:a|strong|em|code|span|sup|sub|b|i|u|small)(?:\s[^>]*)?>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x2F;/g, '/'),
  );
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Like mdast-util-to-string, but a hard line break contributes a SPACE.
 *  `mdToString` concatenates around `break` nodes, so the DMCA agent's
 *  address came back as "Managing MemberCustom Canvas LLC3120 Southwest…"
 *  while the page renders it as separate lines via <br> — a divergence in the
 *  checker, not in the page. */
function blockText(node) {
  if (node.type === 'break') return ' ';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if (Array.isArray(node.children)) return node.children.map(blockText).join('');
  return mdToString(node);
}

/** Every leaf block a reader sees, as plain text. A list item's own text
 *  excludes nested lists (those come back as their own items), so each unit
 *  is a thing that renders inside one element on the page. */
function sourceBlocks(markdown) {
  const tree = parser.parse(markdown);
  const blocks = [];

  const walk = (node) => {
    switch (node.type) {
      case 'paragraph':
      case 'heading':
      case 'tableCell':
        blocks.push(blockText(node));
        return;
      case 'listItem': {
        // Direct paragraph children only; nested lists recurse separately.
        const own = (node.children ?? []).filter((c) => c.type !== 'list');
        if (own.length) blocks.push(own.map(blockText).join(' '));
        (node.children ?? []).filter((c) => c.type === 'list').forEach(walk);
        return;
      }
      case 'code':
        blocks.push(node.value);
        return;
      default:
        (node.children ?? []).forEach(walk);
    }
  };

  walk(tree);
  return blocks.map(norm).filter((b) => b.length > 40);
}

const DMCA_PLACEHOLDER = /\[(NAME OR POSITION|TELEPHONE NUMBER|DEDICATED DMCA EMAIL)\]/;
/** The page prints these itself, so the loader strips them from the body. */
const isIdentityLine = (b) => /Version\s+\d+\.\d+/.test(b) && /Effective:/.test(b);

let missingTotal = 0;
let checkedTotal = 0;

for (const [slug, file] of Object.entries(DOCS)) {
  const text = pageText(slug);
  const blocks = sourceBlocks(fs.readFileSync(path.join(MD_DIR, file), 'utf8'));
  const missing = [];

  for (const b of blocks) {
    if (isIdentityLine(b)) continue;
    // The designated-agent block is deliberately replaced while counsel's A4
    // placeholders are unfilled; src/lib/legalDocuments.test.ts covers that.
    if (slug === 'dmca' && DMCA_PLACEHOLDER.test(b)) continue;
    checkedTotal++;
    if (!text.includes(b)) missing.push(b);
  }

  const versionLine = /Version \d+\.\d+ · Effective \w+ \d+, \d{4}/.exec(text)?.[0];
  if (!versionLine) missing.push('(no "Version X · Effective <date>" line on the page)');

  if (missing.length) {
    missingTotal += missing.length;
    console.log(`\nFAIL  /${slug} — ${missing.length} of ${blocks.length} blocks missing:`);
    for (const m of missing.slice(0, 6)) console.log(`        · ${m.slice(0, 110)}…`);
  } else {
    console.log(`ok    /${slug} — ${blocks.length} blocks · ${versionLine}`);
  }
}

console.log(`\n${checkedTotal} blocks checked across 8 documents, ${missingTotal} missing.`);
process.exit(missingTotal ? 1 : 0);
