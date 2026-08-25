// Artist Agreement versioning. Bump when the agreement text changes in a way
// that requires re-acceptance; the submit gate compares an artist's recorded
// agreement_version against this and forces a fresh acceptance on mismatch.
export const ARTIST_AGREEMENT_VERSION = '1.0';

// The five plain-language points every artist must see at the moment of
// acceptance (onboarding summary box). The full text lives at
// /artist-agreement; these are the load-bearing terms.
export const AGREEMENT_SUMMARY = [
  'Custom Canvas keeps a 15% commission on each sale. You receive the remaining 85% of your price, plus 100% of your shipping charge.',
  'Payouts arrive via Stripe about 14 days after each sale — the delay protects everyone while a payment clears the dispute window.',
  'Refunds are yours to approve. If you approve one, the buyer is made whole and your payout for that sale is reversed.',
  'You confirm every piece you list is your own original work and yours to sell.',
  'You give us permission to show your art and name on the platform and in Custom Canvas marketing (and nothing more — no other reproduction rights).',
] as const;
