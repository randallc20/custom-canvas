import { ARTIST_AGREEMENT_VERSION } from '@/lib/agreement';

// The full Artist Agreement. Artist-gated by the (artist) layout — the split
// and payout mechanics are deliberately not on public pages. v1 DRAFT
// language: reviewed for accuracy against the platform's actual behavior;
// pending counsel review before public launch (see DECISIONS.md).
export const metadata = { title: 'Artist Agreement' };

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-semibold text-ink">{n}. {title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function ArtistAgreementPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-ink">Custom Canvas Artist Agreement</h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        Version {ARTIST_AGREEMENT_VERSION} · This agreement is between you (the artist) and
        Custom Canvas LLC. You accept it when you create your artist account; your acceptance
        and its date are recorded.
      </p>

      <Section n={1} title="Commission and what you're paid">
        <p>
          Custom Canvas keeps a commission of <strong className="text-ink">15% of your artwork price</strong> on
          each sale. You receive the remaining <strong className="text-ink">85% of your price, plus 100% of the
          shipping charge</strong> you set. The commission never applies to shipping. Buyers separately pay a
          small service fee that covers payment processing; it neither comes from nor goes to you.
        </p>
      </Section>

      <Section n={2} title="Payouts">
        <p>
          Payouts are handled by Stripe and arrive in your bank account approximately{' '}
          <strong className="text-ink">14 days after each sale</strong>. This delay exists so that funds are
          still available if a payment is disputed — it protects you from a payment being clawed back out of
          your personal bank account. Your payout account is governed by Stripe&apos;s Connected Account
          Agreement, which you accept during Stripe onboarding.
        </p>
      </Section>

      <Section n={3} title="Refunds">
        <p>
          Refunds are at your discretion: buyers request them from you directly through Messages. If you
          approve a refund, Custom Canvas returns the artwork price, shipping, and associated sales tax to the
          buyer, your payout for that sale is reversed in full, and Custom Canvas returns its commission. If
          the piece was never shipped, its listing returns to the market automatically; if it shipped, you
          relist it after the piece comes back to you.
        </p>
      </Section>

      <Section n={4} title="Disputes and chargebacks">
        <p>
          If a buyer disputes a charge with their card issuer, Stripe&apos;s dispute process applies. Where a
          dispute is resolved against the sale, the payout for that sale may be reversed in the same way as an
          approved refund. Custom Canvas will handle the dispute response and will ask you promptly for
          shipping evidence and order details — responding quickly materially improves the odds of winning.
        </p>
      </Section>

      <Section n={5} title="Your work: originality and rights">
        <p>
          You represent that every piece you list is your own original work, that you own or control all
          rights needed to sell it, and that nothing you list infringes anyone else&apos;s copyright,
          trademark, or other rights. You indemnify Custom Canvas against claims arising from a breach of
          this representation.
        </p>
      </Section>

      <Section n={6} title="License to display and promote">
        <p>
          You grant Custom Canvas a non-exclusive, royalty-free license to display the images, titles, and
          descriptions you upload — on the platform and in Custom Canvas marketing (for example the featured
          shelf, social media, and press materials), always with attribution to you. This license is{' '}
          <strong className="text-ink">limited to display and promotion</strong>: it grants no right to
          reproduce, sell copies of, mint, tokenize, or create derivatives of your work, and it ends for a
          given piece when you remove it (except in materials already published). You keep all copyright in
          your work.
        </p>
      </Section>

      <Section n={7} title="Taxes">
        <p>
          Custom Canvas is the merchant of record for sales tax: we calculate, collect, and remit sales tax
          on orders. You are responsible for your own income taxes; Stripe will issue you a Form 1099-K where
          legally required. Nothing here is tax advice — talk to your tax professional.
        </p>
      </Section>

      <Section n={8} title="Your responsibilities">
        <p>
          You agree to: ship sold work promptly and update the order with tracking (or coordinate local
          pickup through Messages); describe work accurately, including dimensions and condition; keep your
          listings&apos; availability current; and not list prohibited content (work that infringes others&apos;
          rights, counterfeit or mass-produced items presented as originals, or unlawful material).
        </p>
      </Section>

      <Section n={9} title="Review, term, and termination">
        <p>
          New shops are reviewed before going live, and Custom Canvas may decline or remove listings or
          accounts that violate this agreement. You may stop selling at any time; obligations for completed
          sales (fulfillment, refunds already approved, the license for already-published marketing) survive.
          Custom Canvas may update this agreement; material changes require your re-acceptance before your
          next submission, and continued selling after notice constitutes acceptance for changes that are not
          material.
        </p>
      </Section>

      <p className="mt-8 border-t border-line pt-4 text-xs text-muted">
        Questions? support@customcanvas.shop · Custom Canvas LLC, Houston, Texas
      </p>
    </div>
  );
}
