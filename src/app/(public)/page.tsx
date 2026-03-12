import type { Metadata } from 'next';
import { ArtFeed } from '@/components/feed/ArtFeed';

export const metadata: Metadata = {
  title: 'Custom Canvas — Discover Art',
  description: 'Discover and purchase original art from emerging artists.',
};

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <ArtFeed />
    </div>
  );
}
