import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LEGAL_DOCUMENTS, loadLegalDocument, type LegalSlug } from '@/lib/legalDocuments';

/** Element map for the legal documents. No typography plugin in this project,
 *  so every element the counsel set actually uses is styled here against the
 *  site tokens. The documents use GFM tables (processor lists, fee examples,
 *  the protection requirements), so tables scroll on their own rather than
 *  letting the page scroll sideways on a phone. */
/** react-markdown passes its AST `node` to every component override, and
 *  spreading the props straight onto a DOM element leaks it as
 *  `node="[object Object]"` — invalid HTML on every heading, paragraph and
 *  list item of all eight legal documents. Strip it once here.
 *
 *  The `h1` override renders an `h2`. The page already has the document's
 *  title as its `h1`; a stray `#` inside a document body produced a SECOND
 *  one, which `/shipping-returns` had. One `h1` per page, and the body's top
 *  level sits under it where it belongs. */
type MaybeNode = { node?: unknown };
function omitNode<T extends object>(props: T): Omit<T, 'node'> {
  const { node: _node, ...rest } = props as T & MaybeNode;
  return rest as Omit<T, 'node'>;
}

const components = {
  h1: (p: React.ComponentProps<'h1'>) => (
    <h2 className="mt-10 mb-3 font-display text-2xl font-bold text-ink" {...omitNode(p)} />
  ),
  h2: (p: React.ComponentProps<'h2'>) => (
    <h2 className="mt-8 mb-3 font-display text-xl font-bold text-ink" {...omitNode(p)} />
  ),
  h3: (p: React.ComponentProps<'h3'>) => (
    <h3 className="mt-6 mb-2 text-base font-semibold text-ink" {...omitNode(p)} />
  ),
  h4: (p: React.ComponentProps<'h4'>) => (
    <h4 className="mt-4 mb-2 text-sm font-semibold text-ink" {...omitNode(p)} />
  ),
  p: (p: React.ComponentProps<'p'>) => (
    <p className="mb-4 text-sm leading-relaxed text-muted" {...omitNode(p)} />
  ),
  ul: (p: React.ComponentProps<'ul'>) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted" {...omitNode(p)} />
  ),
  ol: (p: React.ComponentProps<'ol'>) => (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted" {...omitNode(p)} />
  ),
  li: (p: React.ComponentProps<'li'>) => <li className="pl-1" {...omitNode(p)} />,
  strong: (p: React.ComponentProps<'strong'>) => (
    <strong className="font-semibold text-ink" {...omitNode(p)} />
  ),
  em: (p: React.ComponentProps<'em'>) => <em className="italic" {...omitNode(p)} />,
  hr: () => <hr className="my-8 border-line" />,
  blockquote: (p: React.ComponentProps<'blockquote'>) => (
    <blockquote
      className="mb-4 rounded-r border-l-2 border-terra bg-sand/50 px-4 py-3 text-sm leading-relaxed text-muted [&>p:last-child]:mb-0"
      {...omitNode(p)}
    />
  ),
  a: ({ href, ...p }: React.ComponentProps<'a'>) => (
    <a
      href={href}
      className="text-terraText underline underline-offset-2 transition-colors duration-150 hover:text-terraTextDark"
      {...(href?.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...omitNode(p)}
    />
  ),
  table: (p: React.ComponentProps<'table'>) => (
    <div className="mb-4 overflow-x-auto rounded border border-line">
      <table className="w-full border-collapse text-left text-sm" {...omitNode(p)} />
    </div>
  ),
  thead: (p: React.ComponentProps<'thead'>) => <thead className="bg-sand" {...omitNode(p)} />,
  th: (p: React.ComponentProps<'th'>) => (
    <th className="border-b border-line px-3 py-2 align-top font-semibold text-ink" {...omitNode(p)} />
  ),
  td: (p: React.ComponentProps<'td'>) => (
    <td className="border-b border-line px-3 py-2 align-top text-muted" {...omitNode(p)} />
  ),
  code: (p: React.ComponentProps<'code'>) => (
    <code className="rounded bg-sand px-1 py-0.5 text-[0.8125rem] text-ink" {...omitNode(p)} />
  ),
};

/** The other seven documents, so every page is one click from the rest of the
 *  set — ToS §16.1 and Terms of Sale §9 both promise the documents are
 *  published and cross-linked. */
function SeeAlso({ current }: { current: LegalSlug }) {
  const others = LEGAL_DOCUMENTS.filter((d) => d.slug !== current);
  return (
    <nav aria-label="Other policies" className="mt-12 border-t border-line pt-6">
      <h2 className="mb-3 text-sm font-semibold text-ink">See also</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {others.map((d) => (
          <li key={d.slug}>
            <Link
              href={`/${d.slug}`}
              className="text-sm text-muted underline underline-offset-2 transition-colors duration-150 hover:text-ink"
            >
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Renders one of the eight documents from its markdown source. The version
 *  and effective date in the header are parsed from the document itself, so
 *  replacing the markdown file is the whole of "publishing a new version". */
export function LegalDocument({
  slug,
  children,
}: {
  slug: LegalSlug;
  /** Optional block rendered between the header and the document — used by
   *  /dmca to carry the interim designated-agent notice (L11 removes it). */
  children?: React.ReactNode;
}) {
  const doc = loadLegalDocument(slug);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-ink">{doc.title}</h1>
      <p className="mt-1 text-sm text-muted">
        Version {doc.version} · Effective {doc.effective}
      </p>
      {children}
      <div className="mt-8">
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {doc.body}
        </Markdown>
      </div>
      <SeeAlso current={slug} />
    </div>
  );
}
