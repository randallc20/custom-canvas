import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-line">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-ink">Page not found</h2>
      <p className="mt-2 text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-6 flex gap-4">
        <Link
          href="/"
          className="rounded-lg bg-terraText px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terraTextDark"
        >
          Explore Art
        </Link>
        <Link
          href="/about"
          className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-sand/50"
        >
          About Custom Canvas
        </Link>
      </div>
    </div>
  );
}
