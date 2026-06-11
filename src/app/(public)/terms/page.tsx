import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Custom Canvas terms of service.',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold text-gray-900">Terms of Service</h1>
      <p className="mb-4 text-sm text-gray-400">Last updated: June 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-gray-600">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Custom Canvas, you agree to be bound by these Terms of Service.
            If you do not agree, please do not use the platform.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">2. Accounts</h2>
          <p>
            You are responsible for maintaining the security of your account and for all activities
            that occur under your account. You must provide accurate information during registration.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">3. Artist Listings</h2>
          <p>
            Artists are responsible for the accuracy of their listings, including descriptions,
            pricing, and images. All artwork must be original or properly licensed.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">4. Purchases &amp; Payments</h2>
          <p>
            All transactions are processed through Stripe. Custom Canvas charges a 15% platform
            fee on each sale. Artists receive 85% of the sale price via Stripe Connect payouts.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">5. Commissions</h2>
          <p>
            Commission agreements are between the buyer and artist. Custom Canvas facilitates
            communication and payment but is not a party to the commission agreement.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">6. Prohibited Conduct</h2>
          <p>
            You may not use Custom Canvas for any unlawful purpose, to harass others, to post
            misleading content, or to infringe on intellectual property rights.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">7. Limitation of Liability</h2>
          <p>
            Custom Canvas is provided &quot;as is&quot; without warranties of any kind. We are not liable
            for any indirect, incidental, or consequential damages arising from your use of the platform.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-900">8. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the platform after
            changes constitutes acceptance of the updated terms.
          </p>
        </section>
      </div>
    </div>
  );
}
