import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'Custom Canvas connects local artists with the communities around them — and with collectors anywhere.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold text-ink">About Custom Canvas</h1>

      <div className="space-y-6 text-muted">
        <p className="text-lg">
          Custom Canvas is an online art marketplace built to connect local artists with the
          people around them — choose your city and discover the art being made in your
          community. Fall for a piece from somewhere else? It ships.
        </p>

        <h2 className="text-xl font-semibold text-ink">Our Mission</h2>
        <p>
          We believe every artist deserves a platform to share their work with the world.
          Custom Canvas makes it easy for artists to showcase, sell, and accept commissions —
          while giving collectors a curated space to discover one-of-a-kind pieces from
          your city&apos;s creative community.
        </p>

        <h2 className="text-xl font-semibold text-ink">How It Works</h2>
        <ul className="list-inside list-disc space-y-2">
          <li>Artists create profiles, upload their work, and set their own prices.</li>
          <li>Collectors browse, save, and purchase art directly from artists.</li>
          <li>Galleries can apply for verified accounts to represent local artists.</li>
          <li>Commission requests let collectors work with artists on custom pieces.</li>
        </ul>

        <h2 className="text-xl font-semibold text-ink">For Artists</h2>
        <p>
          Keep the lion&apos;s share of every sale. We handle payments, provide a
          storefront, and connect you with collectors who are looking for exactly what
          you create. Full terms are in the Artist Agreement you accept when you join.
        </p>

        <h2 className="text-xl font-semibold text-ink">Fair, Simple Pricing</h2>
        <p>
          The price you see is the artist&apos;s price. Buyers pay a small service fee that
          covers payment processing — about 3% of the price plus shipping ($3.30 on a $100
          piece), applied to every order regardless of payment method. Sales tax is
          calculated at checkout. A share of each sale supports the platform; artists keep
          the rest, plus all of their shipping.
        </p>

        <h2 className="text-xl font-semibold text-ink">Contact</h2>
        <p>
          Questions or feedback? Reach us at{' '}
          <span className="font-medium text-terraText">support@customcanvas.shop</span>
        </p>
      </div>
    </div>
  );
}
