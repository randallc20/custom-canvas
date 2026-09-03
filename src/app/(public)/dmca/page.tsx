import { LegalDocument } from '@/components/legal/LegalDocument';
import { legalMetadata } from '@/lib/legalDocuments';

// Rendered from docs/legal/website legal documents/markdown/ — the counsel
// set is the page. Do not transcribe it into JSX (L1).
/** The six elements the policy requires, as a mailto body. Kept beside the
 *  page rather than in the markdown, because counsel owns the document and
 *  this is a convenience on top of it. */
const NOTICE_BODY = [
  'DMCA notice of claimed infringement',
  '',
  'All six elements below are required. Please complete each one.',
  '',
  '1. Your physical or electronic signature:',
  '',
  '2. The copyrighted work you say is infringed (title, and where it can be seen):',
  '',
  '3. The material on Custom Canvas you say infringes — please include a direct URL to the listing or profile:',
  '',
  '4. Your name, address, telephone number and email:',
  '',
  '5. A statement that you believe in good faith that the use is not authorised by the copyright owner, its agent, or the law:',
  '',
  '6. A statement that the information in this notice is accurate, and, under penalty of perjury, that you are the owner of the copyright or authorised to act on the owner\'s behalf:',
  '',
].join('\n');

const NOTICE_MAILTO = `mailto:support@customcanvas.shop?subject=${encodeURIComponent(
  'DMCA notice of claimed infringement',
)}&body=${encodeURIComponent(NOTICE_BODY)}`;

export const metadata = legalMetadata('dmca');

export default function DmcaPolicyPage() {
  return (
    <LegalDocument slug="dmca">
      {/* L11: the policy lists six required elements and warns that "an
          incomplete notice may not trigger our obligations". A mailto with
          them pre-filled is the difference between that being a fair warning
          and a trap. */}
      <div className="mt-4 rounded-xl border border-line bg-sand/50 px-4 py-3 text-sm">
        <p className="font-medium text-ink">Sending a notice</p>
        <p className="mt-1 text-muted">
          A notice needs all six elements below. This opens an email with them laid out, so
          nothing is missed.
        </p>
        <a
          href={NOTICE_MAILTO}
          className="mt-2 inline-block rounded-full bg-terraText px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-terraTextDark"
        >
          Start a copyright notice
        </a>
        <p className="mt-2 text-xs text-muted">
          Knowingly misrepresenting that material is infringing can make you liable for damages,
          including costs and legal fees, under 17 U.S.C. §512(f).
        </p>
      </div>
    </LegalDocument>
  );
}
