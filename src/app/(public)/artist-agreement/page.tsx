import { LegalDocument } from '@/components/legal/LegalDocument';
import { legalMetadata } from '@/lib/legalDocuments';

// Rendered from docs/legal/website legal documents/markdown/ — the counsel
// set is the page. Do not transcribe it into JSX (L1).
export const metadata = legalMetadata('artist-agreement');

export default function ArtistAgreementPage() {
  return (
    <LegalDocument slug="artist-agreement">
      {/* AA §4: "The Seller Protection Policy is part of this agreement and is
          incorporated into it by reference. It is versioned with this
          agreement." An artist accepting this is accepting that too, so it is
          named at the top rather than left to be discovered in §4 (L9). */}
      <div className="mt-4 rounded-xl border border-line bg-sand/50 px-4 py-3 text-sm">
        <p className="font-medium text-ink">Incorporated into this agreement</p>
        <p className="mt-1 text-muted">
          The{' '}
          <a href="/seller-protection" className="font-medium text-terraText underline underline-offset-2">
            Seller Protection Policy
          </a>{' '}
          is part of this agreement (§4) and versioned with it — it decides who bears a
          chargeback. The{' '}
          <a href="/listing-standards" className="font-medium text-terraText underline underline-offset-2">
            Listing Standards
          </a>{' '}
          are binding on every listing you publish (§5).
        </p>
      </div>
    </LegalDocument>
  );
}
