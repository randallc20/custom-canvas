import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Custom Canvas privacy policy.',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold text-ink">Privacy Policy</h1>
      <p className="mb-4 text-sm text-muted">Last updated: June 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-muted">
        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Information We Collect</h2>
          <p>
            We collect information you provide directly: name, email address, profile details,
            and payment information (processed securely through Stripe). We also collect usage
            data such as pages visited and actions taken on the platform.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">How We Use Your Information</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>To provide and maintain the Custom Canvas platform</li>
            <li>To process transactions and send related information</li>
            <li>To send notifications about your account, orders, and commissions</li>
            <li>To respond to your requests and support inquiries</li>
            <li>To improve and personalize your experience</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Payment Information</h2>
          <p>
            Payment processing is handled by Stripe. We do not store your full credit card
            number on our servers. Please refer to Stripe&apos;s privacy policy for details
            on how they handle your payment information.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Data Sharing</h2>
          <p>
            We do not sell your personal information. We share data only with service providers
            necessary to operate the platform (Supabase for data storage, Stripe for payments,
            Resend for email delivery) and when required by law.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Data Security</h2>
          <p>
            We use industry-standard security measures including encryption in transit (TLS),
            row-level security policies on our database, and secure authentication through Supabase Auth.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Your Rights</h2>
          <p>
            You may access, update, or delete your account information at any time through
            your account settings. To request complete data deletion, contact us at{' '}
            <span className="font-medium text-terra">privacy@customcanvas.shop</span>.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-ink">Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. We will notify you of
            significant changes via email or through the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
