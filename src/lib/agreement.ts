// Versions of the documents whose acceptance is recorded against an account.
//
// These are the numbers the acceptance record is stamped with, and they must
// match the "Version X.Y" line in the corresponding markdown under
// docs/legal/website legal documents/markdown/ — src/lib/legalDocuments.test.ts
// asserts they do, so bumping a document without bumping the constant (or the
// reverse) fails the unit run rather than silently recording an acceptance of
// a version nobody saw.
//
// Bump a version when the text changes in a way that requires re-acceptance.
// Terms of Service §17 makes that mandatory for a material change, and every
// signed-in account is then asked again through the acceptance interstitial.

/** Terms of Service. v2.0 added an arbitration clause and a class-action
 *  waiver — material under §17, hence ruling D11's re-acceptance of every
 *  existing account. */
export const TERMS_VERSION = '2.0';

/** Terms of Sale. Accepted at checkout ("you accept them at checkout"), or in
 *  the interstitial for an existing buyer. */
export const TERMS_OF_SALE_VERSION = '2.0';

/** Artist Agreement. The submit-for-review gate compares an artist's recorded
 *  agreement_version against this and forces a fresh acceptance on mismatch. */
export const ARTIST_AGREEMENT_VERSION = '2.0';

/** Seller Protection Policy. The policy "is part of this agreement and is
 *  incorporated into it by reference. It is versioned with this agreement"
 *  (Artist Agreement §4) — so acceptance of it is not recorded separately;
 *  the stamped agreement_version covers it. This constant exists so the
 *  summary can name the version an artist is accepting. */
export const SELLER_PROTECTION_VERSION = '1.0';

/** Privacy Policy. Not separately accepted — the registration checkbox names
 *  it alongside the Terms of Service and it is stamped with them. */
export const PRIVACY_VERSION = '2.0';

/** The load-bearing terms of Artist Agreement v2.0, shown at the moment of
 *  acceptance (onboarding, and the re-acceptance interstitial). The full text
 *  is at /artist-agreement and the protection detail at /seller-protection.
 *
 *  This list is what an artist is told before they click. It grew from five
 *  points to nine at v2.0 because the counsel set makes promises the old
 *  summary never mentioned — risk of loss, the shipping-coverage obligation,
 *  the buyer's unilateral cancel right on a missed window, and the fact that
 *  a refund can be conditioned on the piece coming back. An artist who reads
 *  only this box should not be surprised later. */
export const AGREEMENT_SUMMARY = [
  'You are the seller of your work. Custom Canvas runs the marketplace and handles payment; the sale is between you and the buyer.',
  'Custom Canvas keeps a 15% commission on your artwork price. You receive the remaining 85%, plus 100% of the shipping you charge.',
  'Payouts arrive via Stripe about 14 days after each sale — the delay protects everyone while a payment clears the dispute window.',
  'Ship within 5 business days with tracking from USPS, UPS, FedEx or DHL, and get signature confirmation on orders of $750 or more.',
  'If you miss that window, tell the buyer and offer a new date. If they do not agree, they can cancel for a full refund and we settle it whether or not you approve.',
  'A chargeback comes out of your payout by default. Custom Canvas absorbs it instead when the order met all six protection requirements — Studio › Sales shows where every order stands before any dispute exists.',
  'Risk of loss stays with you until delivery is confirmed. Buy commercially reasonable shipping coverage for the artwork price and build it into your shipping charge.',
  'Refunds are yours to approve, with four exceptions: a card network decides against us, the law requires it, we substantiate that the piece arrived damaged or materially not as described, or it was never shipped. On a change-of-mind refund the service fee is kept; on a fault refund it is returned to the buyer.',
  'A refund may be conditioned on the buyer returning the piece. Custom Canvas provides the return instructions, and you ordinarily bear return shipping when the fault was yours.',
] as const;

/** What a buyer is agreeing to. Shown in the acceptance interstitial; the
 *  checkout equivalent is the notice above the Pay button. */
export const TERMS_OF_SALE_SUMMARY = [
  'The artist is the seller of the artwork. Custom Canvas operates the marketplace, facilitates payment and collects tax.',
  'You see the artwork price, shipping, the service fee and tax before you pay. The charge appears as CUSTOM CANVAS on your statement.',
  'Artists ship within 5 business days with tracking. If that window is missed you can accept a new date or cancel for a full refund.',
  'There is no automatic right of return — refunds are arranged with the artist. But if a piece never arrives, arrives damaged, is materially not as described, or was never shipped, Custom Canvas refunds you whether or not the artist agrees.',
  'On a change-of-mind refund the service fee is kept. On any of those four fault refunds it is returned to you.',
  'Report visible shipping damage within 48 hours of delivery, and any other material problem within 7 days.',
] as const;
