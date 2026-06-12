import type { Metadata } from 'next';
import Link from 'next/link';
import { ArtFeed } from '@/components/feed/ArtFeed';

export const metadata: Metadata = {
  title: 'Custom Canvas — Discover Art from Houston\'s Emerging Artists',
  description: 'Browse, collect, and commission one-of-a-kind pieces from Houston\'s most talented emerging artists.',
};

export default function HomePage() {
  return (
    <div>
      <section className="bg-gradient-to-b from-orange-50 to-white px-4 py-16 text-center md:py-24">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            Discover art from Houston&apos;s
            <span className="text-terra"> emerging artists</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600 md:text-xl">
            Browse original work, connect with artists, and commission one-of-a-kind pieces
            that tell your story.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="#feed"
              className="rounded-lg bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terraDark"
            >
              Explore Art
            </Link>
            <Link
              href="/register"
              className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Join as an Artist
            </Link>
          </div>
          <div className="mt-10 flex justify-center gap-8 text-sm text-gray-500">
            <div>
              <p className="text-2xl font-bold text-gray-900">85%</p>
              <p>Goes to artists</p>
            </div>
            <div className="border-l border-gray-200" />
            <div>
              <p className="text-2xl font-bold text-gray-900">Houston</p>
              <p>Local talent</p>
            </div>
            <div className="border-l border-gray-200" />
            <div>
              <p className="text-2xl font-bold text-gray-900">Custom</p>
              <p>Commissions welcome</p>
            </div>
          </div>
        </div>
      </section>

      <div id="feed" className="mx-auto max-w-7xl px-4 py-8">
        <h2 className="mb-6 text-2xl font-bold text-gray-900">Recent Work</h2>
        <ArtFeed />
      </div>
    </div>
  );
}
