import { LegalDocument } from '@/components/legal/LegalDocument';
import { legalMetadata } from '@/lib/legalDocuments';

// Rendered from docs/legal/website legal documents/markdown/ — the counsel
// set is the page. Do not transcribe it into JSX (L1).
export const metadata = legalMetadata('shipping-returns');

export default function ShippingReturnsPage() {
  return <LegalDocument slug="shipping-returns" />;
}
